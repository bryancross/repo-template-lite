#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';

var ghClient = require('@octokit/rest');
var HashMap = require('hashmap');

module.exports = Repo;

//Must get the branches first, before getting branch protection

function Repo(ghPAT, owner, repo, res)
{
    this.github = new ghClient({
        host: 'api.github.com',
        protocol: 'https',
        headers: {'user-agent': 'repo-get'}
    });
    this.tasks = new HashMap();
    this.tasks.set("branches",null);
    this.tasks.set("protection",null);
    this.tasks.set("teams",null);

    this.repoArgs = {owner:owner, repo:repo}

    // Authenticate using configured credentials
    // TODO: Fix this, use authentication endpoint
    this.github.authenticate({
        type: 'token',
        token: ghPAT
    });
    this.repoData = {};
    this.res = res;
    return this;
};

Repo.prototype.getRepoConfig = function() {
    console.log("Before");
    this.getTeams();
    console.log("After");
    //this.getTeamAccessInfo();
    //this.getBranches();
};

Repo.prototype.getHooks = async function() {
    var hooks;
    try {
        hooks = await this.github.repos.getHooks(this.repoArgs);
        this.repoData.hooks = hooks.data;
    }
    catch(err)
    {
        this.repoData.hooks = "ERROR " + err.message;
    }
    console.log(JSON.stringify(this.repoData));
    this.res.respond(201,this.repoData,'json');
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
                owner: this.repoArgs.owner,
                repo: this.repoArgs.repo,
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
                this.repoData.teams[i].protection = [];
            }
            else
            {
                this.res.respond(500,'Error retrieving branch protection for branch: ' + this.repoData.branches[i].name);
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
        branches = await this.github.repos.getBranches(this.repoArgs)
        this.repoData.branches = branches.data;
        this.getProtections();
    }
    catch(err)
    {
        this.res.respond(500, "Error retrieving config",err);
        console.log("Error in getBranches");
    }
}

Repo.prototype.getTeams = async function() {

    var teams;

    try {
        teams = await this.github.repos.getTeams(this.repoArgs);
        this.repoData.teams = teams.data;
        this.getBranches();

    }
    catch(err) {
        console.log("Error: " + err.message);
        this.res.respond(500, "Error retrieving config",err);
    }
    //console.log("Teams: " + JSON.stringify(this.repoData.teams));

};

