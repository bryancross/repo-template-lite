const RT = require('./repo-template.js');
var http = require('http');

var argPAT = '';
var httpOptions = {
    port: (process.env.PORT || 3000),
    host: 'localhost'
};

console.log("ARGS: " + process.argv);

startup();

function startup()
{
    console.log("starting repo-template");
    const rt = new RT();
}