/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import { Stack, StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { BuildEnvironmentVariableType } from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Constants } from '../util/constants';

export class FailoverPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        const repo = codecommit.Repository.fromRepositoryName(this, Constants.APP_PREFIX + 'Repo', Constants.APP_PREFIX + 'Repo');

        // Create the build project that will initiate the failover from one region to another region based on the config suppied for failover script
        const initiateFailoverBuildProject = new codebuild.PipelineProject(this, `InitiateFailoverProject`, {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    build: {
                        commands: [
                            'echo executing...commands...',
                            'chmod u+x ./assets/failover/failover.sh',
                            './assets/failover/failover.sh',
                        ]
                    }
                }
            }),
            environment: {
                computeType: codebuild.ComputeType.SMALL,
                buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
                environmentVariables: {
                    'GLOBAL_CLUSTER_NAME': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: 'ToDoMgmt-infra-pri-global-db-cluster'
                    },
                    'AWS_SRC_REGION': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.AWS_SRC_REGION
                    },
                    'AWS_DEST_REGION': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.AWS_DEST_REGION
                    },
                    'BREAK_CLUSTER': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: 'managed'
                    },
                    'TARGET_CLUSTER_ID': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.TARGET_CLUSTER_ID
                    },
                    'TARGET_RDS_PROXY_NAME': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.TARGET_RDS_PROXY_NAME
                    },
                    'RDS_PROXY_TARGET_GROUP_NAME': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: 'default'
                    },
                    'SRC_CLUSTER_ID': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.SRC_CLUSTER_ID
                    },
                    'SRC_RDS_PROXY_NAME': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.SRC_RDS_PROXY_NAME
                    },
                    'CLOUDFRONT_DISTRIBUTION_ID': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.CLOUDFRONT_DISTRIBUTION_ID
                    },
                    'CLOUDFRONT_ORIGIN_ID': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: 'origin1'
                    },
                    'CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME': {
                        type: BuildEnvironmentVariableType.PLAINTEXT,
                        value: process.env.CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME
                    }
                }
            }
        });

        initiateFailoverBuildProject.addToRolePolicy(new iam.PolicyStatement({
            resources: [
                `arn:aws:rds:*:${this.account}:cluster:*`,
                `arn:aws:rds:*:${this.account}:db:*`,
                `arn:aws:rds:*:${this.account}:db-proxy:*`,
                `arn:aws:rds:*:${this.account}:target-group:*`,
                `arn:aws:rds:*:${this.account}:global-cluster:*`,
                `arn:aws:kms::${this.account}:key/*`,
                `arn:aws:cloudfront::${this.account}:distribution/*`
            ],
            actions: [
                'rds:DeregisterDBProxyTargets',
                'rds:DescribeDBProxyTargets',
                'rds:RegisterDBProxyTargets',
                'rds:DescribeGlobalClusters',
                'rds:DescribeDBProxies',
                'rds:DescribeDBProxyTargetGroups',
                'rds:DescribeDBClusters',
                'rds:RemoveFromGlobalCluster',
                'rds:FailoverGlobalCluster',
                'kms:Decrypt',
                'kms:Encrypt',
                'kms:GenerateDataKey',
                'cloudfront:UpdateDistribution',
                'cloudfront:GetDistribution',
                'cloudfront:CreateInvalidation',
                'sts:GetCallerIdentity'
            ]
        }));

        initiateFailoverBuildProject.addToRolePolicy(new iam.PolicyStatement({
            resources: [`arn:aws:s3:::codepipeline-${this.region}-*`],
            actions: [
                's3:PutObject',
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketAcl',
                's3:GetBucketLocation'
            ]
        }));

        const failoverScriptSource = new codepipeline.Artifact();

        new codepipeline.Pipeline(this, 'FailoverPipeline', {
            stages: [
                {
                    stageName: 'FetchSource',
                    actions: [
                        new codepipeline_actions.CodeCommitSourceAction({
                            actionName: 'FetchSource',
                            branch: 'master',
                            repository: repo,
                            output: failoverScriptSource,
                            runOrder: 1
                        })
                    ],
                },
                // Failover Requires an Manual Approval
                {
                    stageName: 'Approval',
                    actions: [
                        new codepipeline_actions.ManualApprovalAction({
                            actionName: 'Approval',
                            additionalInformation: 'Approve Failover from Primary to Secondary?',
                            runOrder: 1
                        })
                    ]
                },
                {
                    stageName: 'Failover',
                    actions: [
                        new codepipeline_actions.CodeBuildAction({
                            actionName: 'initiateFailover',
                            project: initiateFailoverBuildProject,
                            input: failoverScriptSource,
                            runOrder: 1,
                        })
                    ]
                }
            ]
        });
    }
}
