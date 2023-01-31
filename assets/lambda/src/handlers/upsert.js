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
    
    if(event.id && event.status && event.task){
      const id = event.id;
      const status= event.status;
      const task = event.task;
      console.log("Received event task - " + task + " with status " + status + " for id " + id);

      return response = {
        statusCode: 200,
        body: await SQLAdapter.updateToDos(id, status, task)
      };
    }
    else if(event.status && event.task){
      const status= event.status;
      const task = event.task;
      console.log("Received event task - " + task + " with status " + status);

      return response = {
        statusCode: 200,
        body: await SQLAdapter.insertToDos(status, task)
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
  
  console.log("here - 4");
  
  return response;
  
};