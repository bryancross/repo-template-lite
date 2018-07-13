#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';

var ghClient = require('@octokit/rest');
var HttpDispatcher = require('httpdispatcher');
var http = require('http');
var debug = require('debug');

module.exports = Repo;

//Must get the branches first, before getting branch protection



function Repo()
{
    this.repoData = {};
    this.repoArgs = {};
    return this;
};

Repo.prototype.init = function(args)
{
    /*
        args:  GHPAT TEMPLATEURL NEWREPOOWNER NEWREPONAME ASYNC
     */
    this.args = args;
    this.ghPAT = process.env.GH_PAT;
    this.repoArgs.templateRepo = {repo:this.args[2].split('/')[4],owner:this.args[2].split('/')[3]};
    this.repoArgs.newRepo={name:args[4],owner:args[3]};
    if(args.length == 7)
    {
        this.async = args[6] == 'async';
    }
    this.initGitHub();
};

Repo.prototype.initGitHub = function()
{
    this.github = new ghClient({
        baseUrl: 'https://api.github.com'
        ,headers: {'user-agent': 'repo-get'}
        ,debug:true
    });

    this.github.authenticate({
        type: 'token',
        token: this.ghPAT
    });
}

Repo.prototype.initRest = function(req,res)
{
    this.req = req;
    this.res = res;
    this.ghPAT = req.headers.authorization;

    this.initGitHub();

    var body = JSON.parse(req.body);
    this.repoArgs.templateRepo = {repo:body.templateRepoURL.split('/')[4],owner:body.templateRepoURL.split('/')[3]};
    this.async = body.async;
    if(body.hasOwnProperty('newRepoName'))
    {
        this.repoArgs.newRepo = {name:body.newRepoName,owner:body.newRepoOwner};
    }
};


Repo.prototype.getRepoConfig = async function() {
    this.createFromConfig = this.repoArgs.hasOwnProperty('newRepo');
    if(this.async && this.res)
    {
        this.res.respond(200,"Repo creation initiated");
    }
    this.getRepoData();

};

Repo.prototype.getRepoData = async function () {
    var repo;
    try {
        repo = await this.github.repos.get(this.repoArgs.templateRepo);
        this.repoData.repo = repo.data;
        this.github
    }
    catch(err)
    {
        this.repoData.repo = "ERROR " + err.message;
    }
    this.getTeamsAndUsers();

}

Repo.prototype.getHooks = async function() {
    var hooks;
    try {
        hooks = await this.github.repos.getHooks(this.repoArgs.templateRepo);
        this.repoData.hooks = hooks.data;
    }
    catch(err)
    {
        this.repoData.hooks = "ERROR " + err.message;
    }
    //console.log(JSON.stringify(this.repoData));
    if(!this.createFromConfig && this.res)
    {
        this.res.respond(201,this.repoData,'json');
        return this.repoData;
    }
    this.createRepo();

};

Repo.prototype.getContent = function() {
    console.log("Not implemented");
};

Repo.prototype.getProtections = async function() {
    var protections;
    for (var i = 0; i < this.repoData.branches.length;i++)
    {
        try {
            protections = await
            this.github.repos.getBranchProtection({
                owner: this.repoArgs.templateRepo.owner,
                repo: this.repoArgs.templateRepo.repo,
                branch: this.repoData.branches[i].name
            });

            this.repoData.branches[i].protection = protections.data;
            console.log("Protections " + i);
        }
        catch(err)
        {
            if(JSON.parse(err).message === 'Branch not protected')
            {
                console.log("No protections for branch " + this.repoData.branches[i].name);

            }
            else
            {
                if(this.res)
                {
                    this.res.respond(500,'Error retrieving branch protection for branch: ' + this.repoData.branches[i].name);
                }
                else
                {
                    console.log('Error retrieving branch protection for branch: ' + this.repoData.branches[i].name);
                }
                return;
            }
        }
    }
    console.log("Done with protections");
    this.getHooks();
};

Repo.prototype.getBranches = async function() {
    var branches;
    try {
        branches = await this.github.repos.getBranches(this.repoArgs.templateRepo)
        this.repoData.branches = branches.data;
        this.getProtections();
    }
    catch(err)
    {
        if(this.res)
        {
            this.res.respond(500, "Error retrieving config ", err.message,err);
        }
        else
        {
            console.log("Error in getBranches: " + err.message);
        }


    }
}

Repo.prototype.getTeamsAndUsers = async function() {

    var teams;
    var users;

    try {
        teams = await this.github.repos.getTeams(this.repoArgs.templateRepo);
        this.repoData.teams = teams.data;
        users = await this.github.repos.getCollaborators({
                owner:this.repoArgs.templateRepo.owner
                ,repo:this.repoArgs.templateRepo.repo
                ,affiliiation:'all'
        });
        this.repoData.users = users.data;
        this.getBranches();

    }
    catch(err) {
        console.log("Error: " + err.message);
        if(this.res)
        {
            this.res.respond(500, "Error retrieving config",err);
        }
        else
        {
            console.log("Error retrieving config: " + err.message);
        }

    }
};

Repo.prototype.createRepo = async function()
{
    try {
        const repo = await this.github.repos.createForOrg({
            org: this.repoArgs.newRepo.owner
            ,name: this.repoArgs.newRepo.name
            ,description: 'Copy of ' + this.repoArgs.templateRepo.owner + '/' + this.repoArgs.templateRepo.repo + ' ' + (this.repoData.repo.description ? this.repoData.repo.description : '')
            ,auto_init:true //create a readme, and by virtue of that, a master branch
        });

        this.repoData.newRepo = repo.data;

        if(this.repoData.hasOwnProperty('teams'))
        {
            for(var t = 0; t < this.repoData.teams.length;t++)
            {
                var team = await this.github.orgs.addTeamRepo({
                    team_id:this.repoData.teams[t].id
                    ,owner:this.repoArgs.newRepo.owner
                    ,repo:this.repoArgs.newRepo.name
                    ,permission:this.repoData.teams[t].permission
                });
            }
        }
        //Looks like team members are also listed in the output as collaborators.
        //Probably not the end of the world, but additional validation would fix this.
        if(this.repoData.hasOwnProperty('users'))
        {
            for(var u = 0; u < this.repoData.users.length; u++)
            {
                var user = await this.github.repos.addCollaborator({
                     owner:this.repoArgs.newRepo.owner
                    ,repo:this.repoArgs.newRepo.name
                    ,username:this.repoData.users[u].login
                    ,permission:this.repoData.users[u].permission
                });
            }
        }

        const masterSHA = await this.github.gitdata.getReference({
             owner: this.repoArgs.newRepo.owner
            ,repo: this.repoArgs.newRepo.name
            ,ref: 'heads/master'
        });

        this.repoData.newRepo.masterSHA = masterSHA.data.object.sha;
        var sha;
        for(var i = 0; i < this.repoData.branches.length;i++)
        {
            var branch = this.repoData.branches[i];
            if(branch.name != 'master') {
                var newBranch = await
                this.github.gitdata.createReference({
                    owner: this.repoArgs.newRepo.owner
                    , repo: this.repoArgs.newRepo.name
                    , ref: 'refs/heads/' + branch.name
                    , sha: this.repoData.newRepo.masterSHA
                });
            }
            if(branch.hasOwnProperty('protection'))
            {
                var protectionOptions = this.buildProtectionOptions(branch, this.repoArgs.newRepo.owner, this.repoArgs.newRepo.name);
                var protection = await this.github.repos.updateBranchProtection(protectionOptions);
            }

        }

        this.respond(this.repoData,null, 201);
        if(!this.res)
        {
            process.exit(0);
        }
    }
    catch(err)
    {
        this.respond("Error: ", err,501);
    }
};

Repo.prototype.respond = function(msg, err, status)
{
    console.log(typeof msg == 'object' ? JSON.stringify(msg) : msg + " " + (err ? err.message : ""));
    if(this.res)
    {
        this.res.respond(status,msg,err);
    }



}

Repo.prototype.buildProtectionOptions = function(branch, owner,repo)
{
    var templateProtection = branch.protection;
    var retval = {owner:owner
             ,repo:repo
             ,branch:branch.name
             ,required_status_checks: null
             ,required_pull_request_reviews: null
             ,restrictions:null
             ,enforce_admins:templateProtection.enforce_admins.enabled
    };

    if(templateProtection.hasOwnProperty('required_status_checks'))
    {
        retval.required_status_checks = {
            strict:templateProtection.required_status_checks.strict
            ,contexts:templateProtection.required_status_checks.contexts
        }
    }
    if(templateProtection.hasOwnProperty('restrictions'))
    {
        retval.restrictions = {};
        if(templateProtection.restrictions.hasOwnProperty('users'))
        {
            retval.restrictions.users = this.filterArray(templateProtection.restrictions.users,'login');
        }
        if(templateProtection.restrictions.hasOwnProperty('teams'))
        {
            retval.restrictions.teams = this.filterArray(templateProtection.restrictions.teams,'slug');
        }
    }

    if(templateProtection.hasOwnProperty('required_pull_request_reviews')) {
        retval.required_pull_request_reviews = {};
        retval.required_pull_request_reviews.dismiss_stale_reviews = templateProtection.required_pull_request_reviews.dismiss_stale_reviews;
        retval.required_pull_request_reviews.require_code_owner_reviews = templateProtection.required_pull_request_reviews.require_code_owner_reviews;
        if (templateProtection.required_pull_request_reviews.hasOwnProperty('dismissal_restrictions')) {
            retval.required_pull_request_reviews.dismissal_restrictions = {};
            retval.required_pull_request_reviews.dismissal_restrictions.users = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.users, 'login');
            retval.required_pull_request_reviews.dismissal_restrictions.teams = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.teams, 'slug');
        }
    }

    return retval;
};

Repo.prototype.filterArray = function (arr,propname)
{
    var retval = [];
    for(var i = 0; i < arr.length;i++) {
        if (arr[i].hasOwnProperty(propname)) {
            retval.push(arr[i][propname]);
        }
        else {
            retval.push(null);
        }
    }
    return retval;
}
