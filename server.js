var express = require('express');
var serveStatic = require('serve-static');

var app = express();

app.use(serveStatic(__dirname + '/public/html'));

app.get('/foo', function(req, res){
  res.send('This is foo, great.');
});

var port = parseInt(process.env.PORT) || 5000;
app.listen(port, function() {
  console.log("Bell Schedule now running on port " + port);
});