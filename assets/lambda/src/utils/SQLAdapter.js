/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

var mysql = require('mysql');
const SecretsManager = require('./SecretsManager.js');

const region = process.env.APP_REGION;
const secretArn = process.env.SECRET_ARN;    

const createTableSQL = " CREATE TABLE IF NOT EXISTS ToDos (id MEDIUMINT not null auto_increment, CreatedTime TIMESTAMP DEFAULT now(), Status VARCHAR(50), Task VARCHAR(50), primary key(id))"

class SQLAdapter {
    
    static async query(sql) {
        
       var secretValueString = await SecretsManager.getSecret(secretArn, region);    
        console.log('SecretValue from AWS Secrets - ' + secretValueString);
        let secretValue = JSON.parse(secretValueString);
        
        var con = {};
        
        if(secretValue){                    
          con = mysql.createConnection({
                host     : secretValue["host"],
                user     : secretValue["username"],
                password : secretValue["password"],
                port     : secretValue["port"],
                database : secretValue["dbname"]
          });
        }


      const promise = new Promise( (resolve, reject) => {
        con.query(sql, (err, result, values) => {
        if(!err) {
            con.destroy();            
            resolve(result);
        } else {
            console.log(err);
            console.log("Error executing query: " + err.message);
            con.destroy();
            reject(err);
        }       
        });
      });
      console.log ("Returning...");
      return promise;
    }
    
    static createTable ()  {
      console.log("SQLAdapter - createTable");
      //const values = ['ToDos'];
      return this.query(createTableSQL);
      
    }

    static getToDos (id)  {
      console.log("SQLAdapter - Getting ToDos for id - " + id);
      let selectSql = "SELECT * FROM `ToDos` where id = '"+ id +"'"
      //let sqlValues = ['ToDos'];
      return this.query(selectSql);
    }

     static insertToDos (status, task)  {
      console.log("SQLAdapter - inserting into ToDos with task - " + task + " with status " + status);
      let insertSql = "INSERT INTO `ToDos` (`status`, `task`) values ('"+ status +"', '"+ task +"')"
      //let sqlValues = ['ToDos'];
      return this.query(insertSql);
    }
    
     static updateToDos (id, status, task)  {
      console.log("SQLAdapter - Updating ToDos with task - " + task + " with status " + status + " for id " + id);
      let updateSql = "UPDATE `ToDos` set `status`='" + status + "', `task`='" + task + "' where id= '" + id  +"'"
      //let sqlValues = ['ToDos'];
      return this.query(updateSql);
    }

    static removeToDos (id)  {
      console.log("SQLAdapter - Removing ToDos for id - " + id);
      let selectSql = "DELETE FROM `ToDos` where id = '"+ id +"'"
      //let sqlValues = ['ToDos'];
      return this.query(selectSql);
    }
}

 module.exports = SQLAdapter;