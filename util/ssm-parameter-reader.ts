/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import { Construct } from 'constructs';
import { AwsCustomResource, AwsSdkCall, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam'

interface SsmParameterReaderProps {
    parameterName: string;
    region: string;
}

export class SSMParameterReader extends AwsCustomResource {
    constructor(scope: Construct, name: string, props: SsmParameterReaderProps) {
        const { parameterName, region } = props;
        
        const ssmAwsSdkCall: AwsSdkCall = {
            service: 'SSM',
            action: 'getParameter',
            parameters: {
                Name: parameterName
            },
            region,
            physicalResourceId: PhysicalResourceId.of(Date.now().toString()) // Update physical id to always fetch the latest version
        };

        super(scope, name, {
            onUpdate: ssmAwsSdkCall, policy: {
                statements: [new PolicyStatement({
                    resources: [
                        `arn:aws:ssm:${region}:${process.env.CDK_DEFAULT_ACCOUNT}:parameter/*`
                    ],
                    actions: ['ssm:GetParameter'],
                    effect: Effect.ALLOW,
                }
                )]
            }
        });
    }

    public getParameterValue(): string {
        return this.getResponseField('Parameter.Value').toString();
    }
}
