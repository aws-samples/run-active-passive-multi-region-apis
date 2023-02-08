/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Constants, RegionType } from '../util/constants';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { CloudFrontAllowedCachedMethods, CloudFrontAllowedMethods, CloudFrontWebDistribution, OriginProtocolPolicy, OriginSslPolicy, PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { SSMParameterReader } from '../util/ssm-parameter-reader';

// 👇 extend the props interface of LambdaStack
interface AppStackProps extends StackProps {
  vpc: ec2.Vpc;
  dbAccessSecurityGroup: ec2.ISecurityGroup,
  dbProxySecret: sm.ISecret,
  encryptionKey: kms.IKey,
  envType: string,
  primaryStackPrefix?: string
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const infraStackPrefix = `${Constants.APP_PREFIX}-infra-${props.envType}`;
    const rdsCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(this, 'rds', {
      clusterIdentifier: `${infraStackPrefix}-db-cluster`
    });

    const CF_FORWARDED_HEADERS = ['Authorization', 'Origin', 'Accept', 'Referer', 'Accept-Encoding', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'];
    // Create Table function - will not be exposed to API gateway. This can be manually run (or automated) to create the table
    let lambdaCreateTableFunction = getLambda(id, this, props.vpc, rdsCluster, props.dbProxySecret, props.dbAccessSecurityGroup, props.encryptionKey);


    // API CRUD Lambda integrated with API Gateway
    let getToDOsFunction = getCRUDLambda(id, 'GetToDos', './handlers/get.handler', this, props.vpc, rdsCluster, props.dbProxySecret, props.dbAccessSecurityGroup, props.encryptionKey);
    let addToDOsFunction = getCRUDLambda(id, 'UpsertToDos', './handlers/upsert.handler', this, props.vpc, rdsCluster, props.dbProxySecret, props.dbAccessSecurityGroup, props.encryptionKey);
    let removeToDOsFunction = getCRUDLambda(id, 'RemoveToDos', './handlers/remove.handler', this, props.vpc, rdsCluster, props.dbProxySecret, props.dbAccessSecurityGroup, props.encryptionKey);

    let restApi = getApiGateway(id, 'GET', this,
      getToDOsFunction, addToDOsFunction, removeToDOsFunction, props.envType, props.primaryStackPrefix || '');

    // ***********************************************************************************
    // Cloudfront
    // ***********************************************************************************
    if (props.envType == RegionType.PRIMARY) {
      const cf = new CloudFrontWebDistribution(this, 'cf-web-dis', {
        originConfigs: [{
          customOriginSource: {
            domainName: `${restApi.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            originPath: `/${restApi.deploymentStage.stageName}`,
            originProtocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            
          },
          behaviors: [{
            allowedMethods: CloudFrontAllowedMethods.ALL,
            isDefaultBehavior: true,
            cachedMethods: CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
            maxTtl: Duration.seconds(0),
            minTtl: Duration.seconds(0),
            defaultTtl: Duration.seconds(0),
            forwardedValues: {
              headers: CF_FORWARDED_HEADERS,
              queryString: true
            }
          }]
        }],
        priceClass: PriceClass.PRICE_CLASS_ALL
      });
      new CfnOutput(this, 'CloudfrontUrl', { value: cf.distributionDomainName });
      new CfnOutput(this, 'CloudfrontDistributionId', { value: cf.distributionId });
    }
  }
}

function getCRUDLambda(id: string, functionName: string, handlerPath: string,
  stk: AppStack, vpc: ec2.IVpc,
  rdsCluster: rds.IDatabaseCluster, secret: ISecret, dbAccessSecurityGroup: ec2.ISecurityGroup, encryptionKey: IKey) {
  const customRole = new iam.Role(stk, functionName + 'LambdaCRUDRole', {
    roleName: id + functionName + 'LambdaExecutionRole',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSFullAccess')
    ]
  });

  customRole.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'secretsmanager:DescribeSecret',
      'secretsmanager:GetSecretValue'
    ],
    resources: [
      secret.secretFullArn || secret.secretName
    ]
  }));

  encryptionKey.grantDecrypt(customRole);

  const lambdaCRUDFunction = new lambda.Function(stk, functionName + 'LambdaCRUDFunction', {
    code: lambda.Code.fromAsset('assets/lambda/dist/'),
    vpc: vpc,
    role: customRole,
    functionName: id + '-' + functionName,
    handler: handlerPath,
    memorySize: 2048,
    runtime: lambda.Runtime.NODEJS_14_X,
    // allowPublicSubnet: true,
    timeout: Duration.seconds(5),
    environment: {
      APP_REGION: stk.region,
      SECRET_ARN: secret.secretFullArn || secret.secretName
    },
    securityGroups: [dbAccessSecurityGroup]

  });

  return lambdaCRUDFunction;
}

function getApiGateway(id: string, httpMethod: string, stk: AppStack,
  getFunction: lambda.Function, upsertFunction: lambda.Function, removeFunction: lambda.Function, envType: string, primaryStackPrefix: string) {
  const api = new apigateway.RestApi(stk, Constants.APP_PREFIX + 'Api', {
    deployOptions: {
      loggingLevel: MethodLoggingLevel.INFO,
      stageName: 'prod',
    },
  });
  const resource = api.root.addResource('v1');

  let userPool: IUserPool;
  if (envType === RegionType.PRIMARY) {
    userPool = new cognito.UserPool(stk, Constants.APP_PREFIX + 'UserPool');
    const fullAccessScope = new cognito.ResourceServerScope({ scopeName: 'upsert-delete', scopeDescription: Constants.APP_PREFIX + ' Full access' });

    const apiServer = userPool.addResourceServer('ResourceServer', {
      identifier: 'api',
      scopes: [fullAccessScope],
    });

    userPool.addDomain('DomainName', {
      cognitoDomain: {
        domainPrefix: Constants.APP_PREFIX.toLowerCase() + '-dev-api-' + Stack.of(stk).account
      },
    });

    userPool.addClient('todo-app-full-access-client', {
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [cognito.OAuthScope.resourceServer(apiServer, fullAccessScope)],
      },
    });

    // Create a new SSM Parameter holding a String
    new StringParameter(stk, 'UserPoolArnParam', {
      parameterName: `${id}-userpool-arn`,
      stringValue: userPool.userPoolArn
    });
  } else {
    //lookup the Userpool Cognito Arn from the primary region.
    userPool = cognito.UserPool.fromUserPoolArn(stk, 'primary-user-pool', new SSMParameterReader(stk, 'lookupUserPoolArn', { parameterName: `${primaryStackPrefix}-userpool-arn`,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' }).getParameterValue());
  }

  const auth = new apigateway.CognitoUserPoolsAuthorizer(stk, 'todoAuthorizer', {
    cognitoUserPools: [userPool]
  });

  const getIntegration = new apigateway.LambdaIntegration(getFunction, apiGatewayIntegrationOptionsForGET());
  const upsertIntegration = new apigateway.LambdaIntegration(upsertFunction, apiGatewayIntegrationOptions());
  const removeIntegration = new apigateway.LambdaIntegration(removeFunction, apiGatewayIntegrationOptions());

  const responseGetModel = api.addModel('GetResponseModel', {
    contentType: 'application/json',
    modelName: 'GetResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'dataOutput',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  const errorResponseGetModel = api.addModel('GetErrorResponseModel', {
    contentType: 'application/json',
    modelName: 'GetErrorResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'errorResponse',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  const responseUpsertModel = api.addModel('UpsertResponseModel', {
    contentType: 'application/json',
    modelName: 'UpsertResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'dataOutput',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  const errorResponseUpsertModel = api.addModel('UpsertErrorResponseModel', {
    contentType: 'application/json',
    modelName: 'UpsertErrorResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'errorResponse',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  const responseRemoveModel = api.addModel('RemoveResponseModel', {
    contentType: 'application/json',
    modelName: 'RemoveResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'dataOutput',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  const errorResponseRemoveModel = api.addModel('RemoveErrorResponseModel', {
    contentType: 'application/json',
    modelName: 'RemoveErrorResponseModel',
    schema: {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: 'errorResponse',
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        status: { type: apigateway.JsonSchemaType.STRING },
        response: { type: apigateway.JsonSchemaType.STRING }
      }
    }
  });

  resource.addMethod('GET', getIntegration, apiGatewayHttpMethodOptionsForGET(auth, 'get-validator', responseGetModel, errorResponseGetModel));
  resource.addMethod('POST', upsertIntegration, apiGatewayHttpMethodOptions(auth, 'upsert-validator', responseUpsertModel, errorResponseUpsertModel));
  resource.addMethod('DELETE', removeIntegration, apiGatewayHttpMethodOptions(auth, 'delete-validator', responseRemoveModel, errorResponseRemoveModel));

  const apiDeployment = new apigateway.Deployment(stk, 'ToDoDeploys', { retainDeployments: true, api: api, description: 'ToDoApiDeploymentLatest' });
  return api;
}
function apiGatewayIntegrationOptions() {
  return {
    proxy: false,
    integrationResponses: getApiIntegrationResponses()
  }
}

function getApiIntegrationResponses() {
  return [
    {
      statusCode: '200',
      responseTemplates: {
        'application/json': JSON.stringify({ status: 'ok', response: '$util.escapeJavaScript($input.body)' })
      },
      responseParameters: {
        'method.response.header.Content-Type': "'application/json'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'true'"
      }
    },
    {
      selectionPattern: '(\n|.)+',
      statusCode: '400',
      responseTemplates: {
        'application/json': JSON.stringify({ status: 'error', response: "$util.escapeJavaScript($input.path('$.errorMessage'))" })
      },
      responseParameters: {
        'method.response.header.Content-Type': "'application/json'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'true'"
      }
    }
  ]
}

function apiGatewayIntegrationOptionsForGET() {
  return {
    proxy: false,
    requestParameters: {
      'integration.request.querystring.id': 'method.request.querystring.id'
    },
    requestTemplates: {
      'application/json': JSON.stringify({ id: "$util.escapeJavaScript($input.params('id'))" })
    },
    // allowTestInvoke: true,
    integrationResponses: getApiIntegrationResponses()
  }
}

function apiGatewayHttpMethodOptionsForGET(auth: apigateway.CognitoUserPoolsAuthorizer, validatorName: string,
  responseModel: apigateway.Model, errorResponseModel: apigateway.Model) {
  return {
    authorizer: auth,
    authorizationType: apigateway.AuthorizationType.COGNITO,
    authorizationScopes: ['api/upsert-delete'],
    requestParameters: {
      'method.request.querystring.id': true
    },
    requestValidatorOptions: {
      requestValidatorName: validatorName,
      validateRequestBody: true,
      validateRequestParameters: true
    },
    methodResponses: getApiGatewayMethodResponse(responseModel, errorResponseModel)
  }
}

function getApiGatewayMethodResponse(responseModel: apigateway.Model, errorResponseModel: apigateway.Model) {
  return [
    {
      // Successful response from the integration
      statusCode: '200',
      // Define what parameters are allowed or not
      responseParameters: {
        'method.response.header.Content-Type': true,
        'method.response.header.Access-Control-Allow-Origin': true,
        'method.response.header.Access-Control-Allow-Credentials': true
      },
      // Validate the schema on the response
      responseModels: {
        'application/json': responseModel
      }
    },
    {
      // Same thing for the error responses
      statusCode: '400',
      responseParameters: {
        'method.response.header.Content-Type': true,
        'method.response.header.Access-Control-Allow-Origin': true,
        'method.response.header.Access-Control-Allow-Credentials': true
      },
      responseModels: {
        'application/json': errorResponseModel
      }
    }
  ]
}

function apiGatewayHttpMethodOptions(auth: apigateway.CognitoUserPoolsAuthorizer, validatorName: string,
  responseModel: apigateway.Model, errorResponseModel: apigateway.Model) {
  return {
    authorizer: auth,
    authorizationType: apigateway.AuthorizationType.COGNITO,
    authorizationScopes: ['api/upsert-delete'],
    methodResponses: getApiGatewayMethodResponse(responseModel, errorResponseModel)
  }
}

function getLambda(id: string, stk: AppStack, vpc: ec2.IVpc, rdsCluster: rds.IDatabaseCluster, secret: ISecret, dbAccessSecurityGroup: ec2.ISecurityGroup, encryptionKey: IKey) {
  const customRole = new iam.Role(stk, 'LambdaRole', {
    roleName: id + 'LambdaExecutionRole',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSFullAccess')
    ]
  });

  customRole.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'secretsmanager:DescribeSecret',
      'secretsmanager:GetSecretValue'
    ],
    resources: [
      secret.secretFullArn || secret.secretName
    ]
  }));

  encryptionKey.grantDecrypt(customRole);

  const lambdaFunction = new lambda.Function(stk, 'LambdaFunction', {
    code: lambda.Code.fromAsset('assets/lambda/dist/'),
    vpc: vpc,
    role: customRole,
    functionName: id + '-' + 'CreateTableFunction',
    handler: './handlers/createTable.handler',
    memorySize: 2048,
    runtime: lambda.Runtime.NODEJS_14_X,
    timeout: Duration.seconds(5),
    environment: {
      APP_REGION: stk.region,
      SECRET_ARN: secret.secretFullArn || secret.secretName
    },
    securityGroups: [dbAccessSecurityGroup]
  });
  return lambdaFunction;
}
