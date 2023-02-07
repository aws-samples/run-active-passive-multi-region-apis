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

  try {
        
    console.log("Received event: " + JSON.stringify(event))
    
    if(event.id){
      const id = event.id;
      return response = {
        statusCode: 200,
        body: await SQLAdapter.removeToDos(id)
      };
      
    }
    else {
      sqlResponse = {
        err: "Invalid Process Action. Check your input message"
      }
    }

  }
  catch (e) {

    response = {
      statusCode: 500,
      body: 'ERROR OCCURRED. Please check your logs'
    }
  }
  finally {
    console.log("Lambda Executed Successfully!");
  }
  return response;  
};