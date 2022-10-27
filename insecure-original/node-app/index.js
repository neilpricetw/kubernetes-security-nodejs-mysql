const express = require("express");
const mysql = require("mysql");
const app = express();
const port = 3000;

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

const con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
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
