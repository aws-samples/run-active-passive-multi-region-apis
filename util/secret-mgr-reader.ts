/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import { Construct } from 'constructs';
import { AwsCustomResource, AwsSdkCall, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import {PolicyStatement, Effect} from 'aws-cdk-lib/aws-iam'

interface SecretsReaderProps {
  secretName: string;
  region: string;
}

export class SecretsReader extends AwsCustomResource {
  constructor(scope: Construct, name: string, props: SecretsReaderProps) {
    const { secretName: secretName, region } = props;

    const ssmAwsSdkCall: AwsSdkCall = {
      service: 'SecretsManager',
      action: 'listSecrets',
      parameters: {
        Filters: [
          {
            Key: 'name',
            Values: [secretName]
          }          
        ]
      },
      region,
      physicalResourceId: PhysicalResourceId.of(Date.now().toString()) // Update physical id to always fetch the latest version
    };

    super(scope, name, { onUpdate: ssmAwsSdkCall,policy:{
        statements:[new PolicyStatement({
        resources : ['*'],
        actions   : ['secretsmanager:ListSecrets'],
        effect: Effect.ALLOW,
      }
      )]
    }});
  }

  public getParameterValue(): string {
    return this.getResponseField('SecretList.0.ARN').toString();
  }
}
