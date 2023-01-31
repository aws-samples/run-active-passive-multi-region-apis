/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam, aws_kms as kms, aws_rds as rds, Stack, StackProps } from 'aws-cdk-lib';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { RegionType } from '../util/constants';
import { SecretsReader } from '../util/secret-mgr-reader';

// 👇 extend the props interface of LambdaStack
interface InfraStackProps extends StackProps {
  envType: string,
  primaryStackPrefix?: string,
  primaryRegion?: string,
  secondaryRegion?: string,
  dbSecretNameSuffix: string,
  vpcCidr: string
}

export class InfraStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly dbProxySecret: sm.ISecret;
  public readonly dbAccessSecurityGroup: ec2.ISecurityGroup;
  public readonly encryptionKey: kms.IKey;
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // ***********************************************************************************
    // KMS
    // ***********************************************************************************

    this.encryptionKey = new kms.Key(this, `encryption-key`, {
      description: `${id}-encryption-key-alias`,
      alias: `${id}-encryption-key-alias`,
      enableKeyRotation: true
    });

    // ***********************************************************************************
    // VPC
    // ***********************************************************************************

    this.vpc = new ec2.Vpc(this, `vpc`, {
      subnetConfiguration: [
        { name: 'application', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC },
      ],
      vpcName: `${id}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      maxAzs: parseInt(process.env.NUMBER_OF_AVAILABILITY_ZONES || '2', 10)
    });
    // ***********************************************************************************
    // Database Cluster
    // ***********************************************************************************

    const dbSecurityGroup = new ec2.SecurityGroup(this, `db-security-group`, {
      securityGroupName: `${id}-db-security-group`,
      description: `${id}-db-parameter-group`,
      allowAllOutbound: true,
      vpc: this.vpc,
    });

    const dbSubnetGroup = new rds.SubnetGroup(this, `db-subnet-group`, {
      subnetGroupName: `${id}-db-subnet-group`,
      description: `${id}-db-subnet-group`,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      vpc: this.vpc,
    });

    const dbProxySecurityGroup =
      new ec2.SecurityGroup(this, `db-proxy-security-group`, {
        securityGroupName: `${id}-db-proxy-security-group`,
        description: `${id}-db-proxy-parameter-group`,
        vpc: this.vpc,
      });


    dbSecurityGroup.connections.allowFrom(
      dbProxySecurityGroup, ec2.Port.allTcp(), dbProxySecurityGroup.node.id
    );

    this.dbAccessSecurityGroup = new ec2.SecurityGroup(this, 'db-access-security-group', {
      securityGroupName: `${id}-db-access-security-group`,
      allowAllOutbound: true,
      vpc: this.vpc,
    });

    dbProxySecurityGroup.connections.allowFrom(
      this.dbAccessSecurityGroup, ec2.Port.tcp(3306), this.dbAccessSecurityGroup.node.id
    );

    const dbEngineProps = { version: rds.AuroraMysqlEngineVersion.VER_3_02_0 }
    const dbEngine = rds.DatabaseClusterEngine.auroraMysql(dbEngineProps);

    const masterUsername = process.env.DB_MASTER_USER_NAME || 'admin';
    const databaseName = process.env.DB_NAME || 'todo';

    const dbParameterGroup =
      new rds.CfnDBClusterParameterGroup(this, `db-parameter-group`, {
        description: `${id}-db-parameter-group`,
        parameters: {
          binlog_format: 'ROW',
          collation_connection: 'utf8_general_ci',
          collation_server: 'utf8_general_ci',
          character_set_client: 'utf8',
          character_set_connection: 'utf8',
          character_set_filesystem: 'utf8',
          character_set_results: 'utf8',
          character_set_server: 'utf8',
        },
        family: dbEngine.parameterGroupFamily || 'aurora-mysql8.0'
      });

    const envType = props?.envType || RegionType.PRIMARY;
    let dbSecret;
    if (envType === RegionType.PRIMARY) {
      dbSecret = new rds.DatabaseSecret(this, `db-secret`, {
        secretName: `${id}-${props.dbSecretNameSuffix}`,
        username: masterUsername,
        encryptionKey: this.encryptionKey
      });

      new StringParameter(this, 'DBSecretFullArnParameter', {
        parameterName: `${id}-db-secret-full-arn`,
        description: 'The full arn of the RDS DB Secret',
        stringValue: dbSecret.secretFullArn || dbSecret.secretArn
      });

    } else {
      const dbSecretPrimaryRegFullArn = new SecretsReader(this, 'db-secret-primary-reg-fullarn', { secretName: `${props.primaryStackPrefix}-${props.dbSecretNameSuffix}`, region: this.region }).getParameterValue()
      dbSecret = new sm.Secret(this, `sec-db-secret`, {
        secretName: `${id}-${props.dbSecretNameSuffix}`,
        secretObjectValue: {
          username: cdk.SecretValue.unsafePlainText(masterUsername),
          password: cdk.SecretValue.secretsManager(dbSecretPrimaryRegFullArn, {
            jsonField: 'password'
          }),
        },
        encryptionKey: this.encryptionKey
      });
    }
    const masterUserPassword = dbSecret.secretValueFromJson('password').toString();

    const dbCluster = new rds.CfnDBCluster(this, `db-cluster`, {
      ...envType === RegionType.PRIMARY ? {
        masterUsername: masterUsername,
        masterUserPassword,
        databaseName,
      } : {
        globalClusterIdentifier: `${props?.primaryStackPrefix}-global-db-cluster`,
      },
      dbClusterIdentifier: `${id}-db-cluster`,
      dbClusterParameterGroupName: dbParameterGroup.ref,
      dbSubnetGroupName: dbSubnetGroup.subnetGroupName,
      engineVersion: dbEngine.engineVersion?.fullVersion || '5.6.mysql_aurora.1.22.1',
      engine: dbEngine.engineType,
      backupRetentionPeriod: 30,
      copyTagsToSnapshot: true,
      storageEncrypted: true,
      kmsKeyId: this.encryptionKey.keyId,
      vpcSecurityGroupIds: [dbSecurityGroup.securityGroupId],
      enableCloudwatchLogsExports: ['error', 'general', 'slowquery', 'audit'],
    });

    dbCluster.node.addDependency(dbSecret);

    new sm.CfnSecretTargetAttachment(this, `db-secret-attachment`, {
      secretId: dbSecret.secretFullArn || '',
      targetType: 'AWS::RDS::DBCluster',
      targetId: dbCluster.ref,
    });

    if (envType === RegionType.PRIMARY) {
      const globalCluster = new rds.CfnGlobalCluster(this, 'global-db-cluster', {
        sourceDbClusterIdentifier: dbCluster.dbClusterIdentifier,
        globalClusterIdentifier: `${id}-global-db-cluster`,
        deletionProtection: false,
      });

      dbSecret.addReplicaRegion(props?.secondaryRegion || '');
      globalCluster.node.addDependency(dbCluster);
    }

    // Workaround for not supporting Aurora Serverless V2
    const dbScalingConfig =
      new cdk.custom_resources.AwsCustomResource(this, 'db-scaling-config', {
        onCreate: {
          service: 'RDS',
          action: 'modifyDBCluster',
          parameters: {
            DBClusterIdentifier: dbCluster.dbClusterIdentifier,
            ServerlessV2ScalingConfiguration: {
              MinCapacity: process.env.DB_INSTANCE_MIN_CAPACITY || '0.5',
              MaxCapacity: process.env.DB_INSTANCE_MAX_CAPACITY || '1'
            },
          },
          physicalResourceId: cdk.custom_resources.PhysicalResourceId.of(
            dbCluster.dbClusterIdentifier || ''
          ),
        },
        onUpdate: {
          service: 'RDS',
          action: 'modifyDBCluster',
          parameters: {
            DBClusterIdentifier: dbCluster.dbClusterIdentifier,
            ServerlessV2ScalingConfiguration: {
              MinCapacity: process.env.DB_INSTANCE_MIN_CAPACITY || '0.5',
              MaxCapacity: process.env.DB_INSTANCE_MAX_CAPACITY || '1'
            },
          },
          physicalResourceId: cdk.custom_resources.PhysicalResourceId.of(
            dbCluster.dbClusterIdentifier || ''
          ),
        },
        policy: cdk.custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cdk.custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });

    dbScalingConfig.node.addDependency(dbCluster);

    const dbMonitoringRole = new iam.Role(this, `db-monitoring-role`, {
      assumedBy: new iam.ServicePrincipal('monitoring.rds.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonRDSEnhancedMonitoringRole'
        )
      ]
    });

    const dbInstance = new rds.CfnDBInstance(this, `db-instance`, {
      dbClusterIdentifier: dbCluster.dbClusterIdentifier,
      engineVersion: dbCluster.engineVersion,
      engine: dbCluster.engine,
      dbInstanceClass: 'db.serverless',
      dbInstanceIdentifier: `${id}-db-instance`,
      monitoringRoleArn: dbMonitoringRole.roleArn,
      monitoringInterval: 10,
    });

    dbInstance.node.addDependency(dbScalingConfig);

    // ***********************************************************************************
    // Database Proxy
    // ***********************************************************************************

    const dbProxyRole = new iam.Role(this, `db-proxy-role`, {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });

    dbSecret.grantRead(dbProxyRole);
    const dbProxy = new rds.CfnDBProxy(this, `db-proxy`, {
      auth: [{ authScheme: 'SECRETS', secretArn: dbSecret.secretArn }],
      dbProxyName: `${id}-rds-proxy`,
      engineFamily: dbEngine.engineFamily || 'MQSQL',
      roleArn: dbProxyRole.roleArn,
      vpcSecurityGroupIds: [dbProxySecurityGroup.securityGroupId],
      vpcSubnetIds: this.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
    });

    this.dbProxySecret = new sm.Secret(this, `db-proxy-secret`, {
      secretName: `${id}-db-proxy-secret`,
      secretObjectValue: {
        host: cdk.SecretValue.unsafePlainText(dbProxy.attrEndpoint),
        port: cdk.SecretValue.unsafePlainText('3306'),
        dbname: cdk.SecretValue.unsafePlainText(databaseName),
        username: cdk.SecretValue.unsafePlainText(masterUsername),
        password: cdk.SecretValue.secretsManager(dbSecret.secretArn, {
          jsonField: 'password'
        }),
      },
      encryptionKey: this.encryptionKey
    });

    const dbProxyTarget = new rds.CfnDBProxyTargetGroup(this, 'db-proxy-target-group', {
      targetGroupName: 'default',
      dbProxyName: dbProxy.dbProxyName,
      dbClusterIdentifiers: [dbCluster.dbClusterIdentifier || '']
    });
    dbProxyTarget.node.addDependency(dbCluster);

  }
}
