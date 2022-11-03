const express = require("express");
const mysql = require("mysql");
const fs = require('fs');
const app = express();
const port = 3000;

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

const con = mysql.createConnection({
  host: fs.readFileSync("/etc/node-details/host").toString(),
  user: fs.readFileSync("/etc/node-details/user").toString(),
  password: fs.readFileSync("/etc/node-details/pwd").toString(),
  database: fs.readFileSync("/etc/node-details/name").toString()
});

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
  con.query("SELECT User FROM user;", function(err, result) {
    if (err) throw err;
    console.log("Result: " + JSON.stringify(result));
    app.get("/", (req, res) => res.send("<h1>Example NodeJS App</h1>Mysql users returned from db query: " + JSON.stringify(result)));
  });
});
