#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';
const fs = require('fs');
const http = require('http');
const GitHubClient = require('@octokit/rest'); // https://github.com/mikedeboer/node-github
const HttpDispatcher = require('httpdispatcher');
const HashMap = require('hashmap');
const Worker = require('./worker.js');
const JSComp = require('./lib/json-compare.js');
const uNameTest = require('github-username-regex');
const PORT = process.env.PORT || 3000;
const Repo = require('./lib/repository.js');
var events = require('events');
const me = this;


module.exports = RepoTemplate;

function RepoTemplate() {
	try {
        this.init();
	}
	catch(err)
	{
		if(err.code == 'ENOENT' && err.errno == -2)
		{

			this.suspended = true;
		}
		else
		{

			process.exit(0);
		}
	}

	this.initHTTPServer();
}

RepoTemplate.prototype.init = function () {
    var color = Math.floor(Math.random() * 6) + 30;

    this.suspended = true;
    this.config = {};
    this.workers = new HashMap();
};

RepoTemplate.prototype.initHTTPServer = function(){
	let that = this;
	this.dispatcher = new HttpDispatcher();
	this.dispatcher.onPost('/pullrequest', this.handlePullRequest);
	this.dispatcher.onPost('/requestRepo', this.handleRequestRepo);
	this.dispatcher.onGet('/status', this.handleStatus);
	this.dispatcher.onPost('/stop',this.handleStop);
	this.dispatcher.onGet('/suspend', this.handleSuspend);
	this.dispatcher.onGet('/resume',this.handleResume);
	this.dispatcher.onPost('/init',this.handleInit);
	this.dispatcher.onGet('/callback',this.handleCallback);
	this.dispatcher.onGet('/repo',this.handleRepo);
	this.dispatcher.onPost('/repo', this.createRepo);
	this.server = http.createServer((request, response) => {
			try {
                //Given the crazy variable scoping that's going on with dynamic callbacks inside of httpdispatcher
				//I can't think of a better way to pass this instance of RepoTemplate in to the handler methods.
				request.rt = that;
				response.respond = function(status, msg, err) {
                    var respText = {};
                    respText.msg = msg;
					if (typeof err != 'undefined' && err.hasOwnProperty('message')) {
						respText.error = err.message;
                    }
                    this.writeHead(status, {'Content-Type': 'application/json'});
                    this.end(JSON.stringify(respText));
                	};

				// Dispatch
					if (that.suspended
						&& request.url !== '/resume'
						&& request.url !== '/init'
						)
					{

						response.respond(503, this.getStatusMessage());

						return;
					}
					this.dispatcher.dispatch(request, response);
				} catch (err) {
					if (err.message === 'SHUTDOWN')			{
						throw err;
						}
						response.respond(503, "Error dispatching HTTP request",err);
				}
		});

	// Startup the server
	this.server.listen(PORT, () => {
		// Callback when server is successfully listening

	});

	// Cleanup after ourselves if we get nerve-pinched
	process.on('SIGTERM', function () {
		this.server.close(() => {
			self.shutdown();
		});
	});
};

RepoTemplate.prototype.handleRepo = function(req,res) {
	var repo = new Repo(req.headers.authorization,res);
	repo.getRepoConfig(req.params.repoOwner, req.params.repoName);
};

RepoTemplate.prototype.createRepo = function() {
	var body = JSON.parse(req.body);
	this.github.repos.create
};

RepoTemplate.prototype.handleCallback = function(req,res) {

	res.respond(201,'its all good');
		return;
        var query = url.parse(req.url, true).query;
        if (query.state == GitHubConfig.state){
            payload = {
                'code':       	query.code,
                'client_id':     	GitHubConfig.client_id,
                'client_secret': 	GitHubConfig.secret
            }
            console.log(payload);
            request.post({
                    url: 'https://github.com/login/oauth/access_token',
                    formData: payload,
                    headers: {'Accept': 'application/json'}
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var token = JSON.parse(body).access_token;
                        res.statusCode = 302;
                        authorized(res, token);
                    }
                }
            );

        };
};

RepoTemplate.prototype.handleInit = function(req,res)
{

	//Expects full config in the payload, with PAT as auth header
    var PAT = req.headers.auth;
    var regex = /^([a-z|0-9]){40}$/;
    var msg = '';
    var config;

    if (typeof PAT == 'undefined' || !regex.test(PAT))
    {
    	res.respond(401, "Authentication failed: Missing or invalid PAT");
        return;
    }

    try{
    	config = JSON.parse(req.body)
		if(typeof config == 'undefined')
		{
			req.respond(401,"Missing config");
			return;
		}
		req.rt.loadConfig(config);
	}
	catch(err)
	{
        res.respond(401, "Invalid or missing config");
        return;
	}


    req.rt.config.GitHubPAT = req.headers.auth;
	try {
        req.rt.initGitHubClient();
        req.rt.suspended = false;
        req.rt.loadRepoConfigs(req);
        msg = "GitHub client initialization successful";
        res.respond(202, msg);

	}
	catch(err)
	{
		msg = "Error initializing GitHub client: " + err.message
        res.respond(501, msg, err);
    }
};

RepoTemplate.prototype.handleSuspend = function(req, res)
{
	let that = req.rt;
	that.suspended = true;
    res.respond(200,{message: 'Server SUSPEND received.  Server is suspended.'});
};

RepoTemplate.prototype.handleResume = function(req, res)
{
    let that = req.rt
	that.suspended = false;
    res.respond(200,{message: 'Server RESUME received.  Server is resumed.'});

};

RepoTemplate.prototype.handleStop = function(req,res)
{
	let that = req.rt;

    this.server.close(() => {
		self.shutdown();
	});
}

RepoTemplate.prototype.getStatusMessage = function(){

    if(!this.config.global)
	{
		return "Server is suspended.  No configuration loaded";
	}
	if(this.suspended && this.config.GitHubPAT)
    {
        return "Server is suspended";
    }
    else if (this.suspended && (!this.config.hasOwnProperty('GitHubPAT') || this.config.GitHubPAT.length != 40))
    {
        return "Server is suspended.  No PAT set";
    }
    else if (!this.suspended)
    {
        return "Server is active";
    }
}

// Initiate, authenticate, and validate the GitHub Client
RepoTemplate.prototype.initGitHubClient = async function(){
	var self = this;
	this.GHClient = new GitHubClient({
		debug: this.config.global.githubAPIDebug,
		pathPrefix: this.config.global.TemplateSourceHost === 'github.com' ? '' : '/api/v3',
		host: this.config.global.TemplateSourceHost === 'github.com' ? 'api.github.com' : this.config.global.TemplateSourceHost,
		protocol: 'https',
		headers: {'user-agent': this.config.global.userAgent}
	});

/*
	 this.GHClient.authenticate({
	 type: this.config.global.authType,
	 token: this.config.GitHubPAT
	 });
	 */


	var authParams = {}
	// Authenticate using configured credentials
	if(this.config.global.authType == 'token') {
        authParams.type = 'oauth';
        authParams.token = this.config.GitHubPAT
    } else if(this.config.global.authType == 'oauth') {
        authParams.type = "oauth";
        authParams.key = '';
        authParams.secret = '';
        authParams.scopes = ['repo'];
        authParams.note ='Testing...';
        authParams.note_url ='https://github.com/myorg/example';
    }

    this.GHClient.authenticate(authParams);


	// Validate connection by retrieving current user info
    var userData;

    try {
        userData = await this.GHClient.users.get();
        return true;
	}
	catch(err)
	{
		throw new Error("Error authenticating to GitHub: " + err.message);
	}

};

RepoTemplate.prototype.handleRequestRepo = async function (req, res) {

    //God this is a hack-a-saurus rex.  But how else to get a reference to the calling object?
    //Interestingly, if we try to assign this to self it complains on startup that self is already defined.
    //Should debug when we get time
    let that = req.rt;
    var reqJSON;
    try{
        reqJSON = JSON.parse(req.body);
	}
	catch(err)
	{
        res.respond(400, 'JSON request does not conform to template');
		return;
	}

    // Validate that the request JSON is properly formed
	const diffs = JSComp.compareJSON(reqJSON, JSON.parse(fs.readFileSync('./config/repo_requests/request-default-example.json')));
	if (diffs) {
		res.respond(400,'JSON request does not conform to template' + JSON.stringify(diffs));
		return;
	}
	var validationErrors = [];
	if(!uNameTest.test(reqJSON.newRepoOwner))
	{
		validationErrors.push("newRepoOwner value is invalid: " + reqJSON.newRepoOwner);
	}
	if(!uNameTest.test(reqJSON.newRepoName))
	{
		validationErrors.push("newRepoName value is invalid: " + reqJSON.newRepoName);
	}
	if(!uNameTest.test(reqJSON.newRepoTemplate))
	{
		validationErrors.push("newRepoTemlate value is invalid: " + reqJSON.newRepoTemplate);
	}
	if(!uNameTest.test(reqJSON.newRepoRequester))
	{
    	validationErrors.push("newRepoRequester value is invalid: " + reqJSON.newRepoRequester);
	}

	if(validationErrors.length > 0)
	{
        res.respond(400, 'One or more request parameters are invalid', new Error(JSON.stringify(diffs)));
        return;
	}

	let worker;

	try {
		worker = new Worker(reqJSON, that.cloneGlobalConfig());
		worker.events.on('worker.event',function(msg){
			if(msg.type && msg.type == 'done')
			{
                that.popWorker(msg.id);
			}

		});
		that.workers.set(worker.ID, worker);
	} catch (err) {
		if(err.message && err.message == "OAuth2 authentication requires a token or key & secret to be set")
		{
			res.respond(500,'Could not create server object.  Authentication not set',err);
			return
		}

		var msg = {
            message: 'Could not create server object',
            error: err.message
        };
		res.respond(500,msg,err);
		return;
	}
	res.respond(201,JSON.stringify({jobID: worker.getID()}));
	worker.createPullRequest();
};


RepoTemplate.prototype.popWorker = function(id){
	if(this.workers.has(id))
	{
		this.workers.remove(id);
	}
};


// POST to /pullrequest
RepoTemplate.prototype.handlePullRequest = function (req, res) {
    //God this is a hack-a-saurus rex.  But how else to get a reference to the calling object?
    //Interestingly, if we try to assign this to self it complains on startup that self is already defined.
    //Should debug when we get time
    let that = req.rt;
    res.respond(202,{
        message: 'PR event received'
    });

    let PR;

	try {
		PR = JSON.parse(req.body);
	} catch (err) {
		return;
	}

	if (!PR.pull_request || !PR.pull_request.merged) {
		return;
	}

	if (PR.pull_request.base.ref !== that.config.global.repoRequestBranch) {
		return;
	}

  // Var PRBody = PR.pull_request.body.replace(/[\n\r]+/g,'')
	const config = that.cloneGlobalConfig();
	config.params = {TemplateSourceHost: PR.pull_request.url.split('/', 3)[2]};
	config.params.username = config.adminUserName;
	config.params.userPAT = that.config.GitHubPat;
	let worker = new Worker(null, config, PR);
    worker.events.on('worker.event',function(msg){
        if(msg.type && msg.type == 'done')
        {
            that.popWorker(msg.id);
        }

    });
	that.workers.set(worker.getID(), worker);
	worker.createRepository();
};

// GET /status
RepoTemplate.prototype.handleStatus = function (req, res, self) {
	//God this is a hack-a-saurus rex.  But how else to get a reference to the calling object?
	//Interestingly, if we try to assign this to self it complains on startup that self is already defined.
	//Should debug when we get time
	let that = req.rt;

	if(that.suspended)
	{
 		res.respond(200,that.getStatusMessage());
 		return;
	};


	const URL = require('url');
	let jobID;
	let format = 'json';

    // If no query parameters, return the state of the server
	if (!URL.parse(req.url).query) {
		res.respond(200, that.getStatusMessage());
		return;
	}
};


RepoTemplate.prototype.handleLoadRepoConfigs = function(req,res)
{
    res.respond(202, "Load repo configs request received");
	req.rt.loadRepoConfigs(req);
};

RepoTemplate.prototype.asyncLoadRepoConfigs = async function (req) {
	let self = req.rt;
	var repoConfigs = [];
	var repoConfig;

	self.config.repoConfigs = new HashMap();
	try {
        repoConfigs = await self.GHClient.repos.getContent({
            owner: self.config.global.TemplateSourceRepo.split('/')[0],
            repo: self.config.global.TemplateSourceRepo.split('/').pop(),
            path: self.config.global.TemplateSourcePath,
            ref: self.config.global.TemplateSourceBranch
        });

		for(var i = 0; i < repoConfigs.length; i++)
		{
			repoConfig = await self.GHClient.repos.getContent({
                owner: self.config.global.TemplateSourceRepo.split('/')[0],
                repo: self.config.global.TemplateSourceRepo.split('/').pop(),
                path: repoConfigs.data[i].path,
                ref: self.config.global.TemplateSourceBranch
			});
            const B64 = require('js-base64/base64.js').Base64;
            const config = JSON.parse(B64.decode(repoConfig.data.content));
            self.config.repoConfigs.set(config.configName, config);
		}
	}
	catch(err)
	{
        if (err.message == 'Bad credentials'
        )
        {

        }
        else
        {

            self.shutdown();
        }
	}


};


RepoTemplate.prototype.loadRepoConfigs = function (req) {
    let self = req.rt;

	self.config.repoConfigs = new HashMap();

	self.GHClient.repos.getContent({
		owner: self.config.global.TemplateSourceRepo.split('/')[0],
		repo: self.config.global.TemplateSourceRepo.split('/').pop(),
		path: self.config.global.TemplateSourcePath,
		ref: self.config.global.TemplateSourceBranch
	}).then(result => {
		for (let i = 0; i < result.data.length; i++) {

			self.GHClient.repos.getContent({
				owner: self.config.global.TemplateSourceRepo.split('/')[0],
				repo: self.config.global.TemplateSourceRepo.split('/').pop(),
				path: result.data[i].path,
				ref: self.config.global.TemplateSourceBranch
				}).then(result => {
					const B64 = require('js-base64/base64.js').Base64;
					const config = JSON.parse(B64.decode(result.data.content));
					self.config.repoConfigs.set(config.configName, config);

				}).catch(err => {

					self.shutdown();
		});
	}
	}).catch(err => {
        if (err.message == 'Bad credentials'
    )
    {

    }
    else
    {

        self.shutdown();
    }
})
};

RepoTemplate.prototype.loadConfig = function (newConfig)
{
    let origRepoConfigs = new HashMap();

    if (this.config && Object.prototype.hasOwnProperty.call(this.config, 'repoConfigs')) {
        //origRepoConfigs = JSON.parse(JSON.stringify(this.config.repoConfigs));
        origRepoConfigs = new HashMap(this.config.repoConfigs);
        delete this.config["repoConfigs"];
    }

    this.config.global = JSON.parse(JSON.stringify(newConfig.global));
    if (origRepoConfigs) {
        this.config.repoConfigs = origRepoConfigs;
    }

    // GitHub Enterprise uses /api/v3 as a prefix to REST calls, while GitHub.com does not.
    this.config.global.GitHubAPIURLPrefix = (this.config.global.repoRequestHost === 'github.com') ? '' : '/api/v3';

    // If we're going to GitHub, prepend the host with 'api', otherwise leave it be
    this.config.global.targetHost = (this.config.targetHost === 'github.com') ? 'api.github.com' : this.config.global.targetHost;
};

RepoTemplate.prototype.cloneGlobalConfig = function () {
	const repoConfigs = this.config.repoConfigs;
	const newConfig = JSON.parse(JSON.stringify(this.config));
	newConfig.repoConfigs = repoConfigs;
	return newConfig;
};

