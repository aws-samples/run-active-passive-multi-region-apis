/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

'use strict'
const AWS = require('aws-sdk');

class SecretsManager {
     static async getSecret (secretName, region){
         const config = { region : region }
         let secretsManager = new AWS.SecretsManager(config);
         try {
             let secretValue = await secretsManager.getSecretValue({SecretId: secretName}).promise();
             
             if ('SecretString' in secretValue) {
                 return secretValue.SecretString;
             } else {
                 let buff = new Buffer(secretValue.SecretBinary, 'base64');
                 return buff.toString('ascii');
             }
         } catch (err) {
            console.log("Error retrieving secrets! - " + err.code);
            console.log(err);
             if (err.code === 'DecryptionFailureException')
                 // Secrets Manager can't decrypt the protected secret text using the provided KMS key.
                 // Deal with the exception here, and/or rethrow at your discretion.
                 throw err;
             else if (err.code === 'InternalServiceErrorException')
                 // An error occurred on the server side.
                 // Deal with the exception here, and/or rethrow at your discretion.
                 throw err;
             else if (err.code === 'InvalidParameterException')
                 // You provided an invalid value for a parameter.
                 // Deal with the exception here, and/or rethrow at your discretion.
                 throw err;
             else if (err.code === 'InvalidRequestException')
                 // You provided a parameter value that is not valid for the current state of the resource.
                 // Deal with the exception here, and/or rethrow at your discretion.
                 throw err;
             else if (err.code === 'ResourceNotFoundException')
                 // We can't find the resource that you asked for.
                 // Deal with the exception here, and/or rethrow at your discretion.
                 throw err;
         }
     } 
 }
 module.exports = SecretsManager;
