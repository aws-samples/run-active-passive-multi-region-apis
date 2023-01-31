/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

const SQLAdapter = require('../utils/SQLAdapter.js');

exports.handler = async (event, context) => {

  let sqlResponse = {};
  let response = {
    statusCode: 500,
    body: "error"
  };

    console.log("Received event: " + JSON.stringify(event))
    
    if(event && event.action == "CREATE_TABLE"){
      console.log("calling sql adapter...");

      return response = {
        statusCode: 200,
        body: await SQLAdapter.createTable("CREATE_TABLE")
      };
    }
    else {
        sqlResponse = {
          err: "Invalid Process Action. Check your input message"
        }
         response = {
          statusCode: 500,
          body: sqlResponse
        };
     }
  
  console.log("Lambda Executed Successfully!");
  return response;
  
}