/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import * as cdk from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { Constants } from '../util/constants';
import { PriPipelineStage, SecPipelineStage } from './pipeline-stage';

export class AppPipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const repo = new codecommit.Repository(this, Constants.APP_PREFIX + 'Repo', {
            repositoryName: Constants.APP_PREFIX + 'Repo'
        });

        const pipeline = new CodePipeline(this, Constants.APP_PREFIX + 'Pipeline', {
            pipelineName: Constants.APP_PREFIX + 'Pipeline',
            synth: new CodeBuildStep(Constants.APP_PREFIX + 'SynthStep', {
                input: CodePipelineSource.codeCommit(repo, 'master'),
                installCommands: [
                    'npm install -g aws-cdk'
                ],
                commands: [
                    'echo setting...commands...',
                    'npm install',
                    'npm run build',
                    'cd assets/lambda',
                    'npm install',
                    'cd ../..',
                    'npm run package',
                    'cdk synth'
                ],
                rolePolicyStatements: [
                    new iam.PolicyStatement({
                        actions: ['ec2:DescribeAvailabilityZones'], //this permission is allowed for all the resources
                        resources: ['*'],
                        effect: iam.Effect.ALLOW
                    })
                ]
            })
        });

        const priDeploy = new PriPipelineStage(this, 'PriDeploy', {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION
            }
        });
        pipeline.addStage(priDeploy);
        const secDeploy = new SecPipelineStage(this, 'SecdDeploy', {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_SECONDARY_REGION
            }
        });
        pipeline.addStage(secDeploy);
      
    }
}
