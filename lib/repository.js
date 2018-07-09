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

function Repo(ghPAT, owner, repo)
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
};

Repo.prototype.getRepoConfig = function() {
    this.getTeamAccessInfo();
    this.getBranches();
};

Repo.prototype.getTeamAccessInfo = function() {
    //
    var that = this;
    this.github.repos.getTeams(this.repoArgs)
        .then(result => {
            that.repoData.teams = result.data;
            that.manageTasks("teams");
        })
        .catch(err => {
            that.repoData.teams = {teams: "ERROR: " + err.message}
            that.manageTasks("teams");
        });
};

Repo.prototype.getBranches = function () {
    var that = this;
    this.github.repos.getBranches(this.repoArgs)
        .then(result => {
            that.repoData.branches = result.data;
            that.manageTasks("branches");
            that.getBranchProtection();
            })
        .catch(err => {
            that.repoData.branches = {branches:"ERROR: " + err.message};
            that.manageTasks("branches");
    });
};

Repo.prototype.getHooks = function() {
    var that = this;
};

Repo.prototype.getContent = function() {

};

Repo.prototype.manageTasks = function(key)
{
    //this.repoData[key] = results;
    this.tasks.delete(key);
    console.log("Popped " + key + " " + this.tasks.size + " remaining");
    if(this.tasks.size < 1)
    {
        console.log("Results: " );
    }
}

Repo

Repo.prototype.getBranchProtection = function() {
    var that = this;
    var curBranch;

    for(var i = 0; i < this.repoData.branches.length;i++)
    {
        curBranch = this.repoData.branches[i];
        this.github.repos.getBranchProtection({owner:this.repoArgs.owner,repo:this.repoArgs.repo, branch:curBranch.name})
            .then(result => {
                //Dictionary might work better here, but would require more work on serialization
                for(var b = 0; b < that.repoData.branches.length;b++)
                    {
                        if(that.repoData.branches[b].name == result.data.url.split('/')[7])
                        {
                            that.repoData.branches[b].protection = result.data;
                        }
                    }
        })
            .catch(err => {
                console.log("Error: " + err.message);
                that.manageTasks("protection");
    });
    }
    //can't do Promise.all because the API throws an error if there's no protection on the branch.
};

