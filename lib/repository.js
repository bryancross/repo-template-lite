#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';
const repoData = {};
var repoOwner = '';
var repoName = '';
var ghClient = require('@octokit/rest');
module.exports = Repo;

function Repo(ghPAT, owner, name)
{
    this.github = new ghClient({
        host: 'api.github.com',
        protocol: 'https',
        headers: {'user-agent': 'repo-get'}
    });

    // Authenticate using configured credentials
    // TODO: Fix this, use authentication endpoint
    this.github.authenticate({
        type: 'token',
        token: ghPAT
    });
    this.repoOwner = owner;
    this.repoName = name;
    this.repoData = {};
};

Repo.prototype.getTeamAccessInfo = function() {
    //
    this.github.repos.getTeams({owner:this.repoOwner,repo:this.repoName})
        .then(result => {
            this.repoData.teams = result;
    }).catch(err => {
            console.log("Error: " + err);
    });
};

Repo.prototype.getBranches = function () {

    

};

Repo.prototype.getHooks = function() {

};

Repo.prototype.getContent = function() {

};

Repo.prototype.getProtection = function() {

};

