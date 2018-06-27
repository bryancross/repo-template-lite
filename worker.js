/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';
const requestJson = require('request-json');
const HashMap = require('hashmap');
const fs = require('fs');
const crypto = require('crypto');
const differenceInMilliseconds = require('date-fns/difference_in_milliseconds'); // https://github.com/date-fns/date-fns
const format = require('date-fns/format');  // https://github.com/date-fns/date-fns
const parse = require('date-fns/parse');  // https://github.com/date-fns/date-fns
const GitHubClient = require('github'); // https://github.com/mikedeboer/node-github
var events = require('events');

//let self;  //I spent most of a day figuring out that you only should initialize self in closures where you need it, lolz
let client;

module.exports = Worker;

function Worker(params, config, PR) {
    //self = this; //Only in closures where it's needed
    var color = Math.floor(Math.random() * 6) + 30;
    var colorString = '\x1b[' + color + 'm';
    this.readable = true;
    this.events = new events.EventEmitter();
    this.runtimeData = {};
    this.runtimeData.startTime = format(new Date());
    this.ID = crypto.randomBytes(20).toString('hex');
    config.params = params;
    this.config = config;
    this.runtimeData.PR = PR;
    this.runtimeData.createRepoControllerStatus = new HashMap();
    this.runtimeData.createRepoControllerStatus.exceptions = new HashMap();
    this.initGitHubClient();
};

Worker.prototype.initGitHubClient = function()
{
    this.github = new GitHubClient({
        debug: this.config.global.githubAPIDebug,
        pathPrefix: this.config.global.TemplateSourceHost === 'github.com' ? '' : '/api/v3',
        host: this.config.global.TemplateSourceHost === 'github.com' ? 'api.github.com' : this.config.global.TemplateSourceHost,
        protocol: 'https',
        headers: {'user-agent': this.config.global.userAgent}
    });

    // Authenticate using configured credentials
    // TODO: Fix this, use authentication endpoint
    this.github.authenticate({
        type: this.config.global.authType,
        token: this.config.GitHubPAT
    });
};

Worker.prototype.getID = function() {
    return this.ID;
};

Worker.prototype.createPullRequest = function () {
    this.pullRequestController('begin');
};

Worker.prototype.pullRequestController = function (step, status, result) {
    this.controllerCallback = this.pullRequestController;
    switch (step) {
        case 'begin':
            this.validateUser(this.config.params.newRepoRequester);
            break;
        case 'validateUser':
            if(!status)
            {
                if(result.code == 401) //GitHub client credentials are invalid, bail
                {
                    return;
                }
            }
            else
            {
            }
            this.validateRepository();
            break;
        case 'validateRepository':
            if(!status)
            {

            }
            this.validateOrg();
            break;
        case 'validateOrg':
            if(!status)
            {

            }
            if(this.runtimeData.userValid && this.runtimeData.orgValid)
            {

                this.validateUserInOrg();
            }
            else
            {
                this.getMasterRef();
            }
            break;
        case 'validateUserInOrg':
            if(!status)
            {
            }
            this.getMasterRef();
            break;
        case 'getMasterRef':
            if (!status) {
                return;
            }
            this.createPRBranch();
            break;
        case 'createPRBranch':
            if (!status) {
                return;
            }
            this.createPRFile();
            break;
        case 'createPRFile':
            if (!status) {
                return;
            }
            this.createPR();
            break;
        case 'createPR':
            if (!status) {
                return;
            }
            this.assignPRLabelsAndAssignees();
            break;
        case 'assignPRLabelsAndAssignees':
            if (!status) {
                return;
            }
            break;
        default:
            break;
    }
};

Worker.prototype.validateRepository = function(reponame)
{
    let self = this;
    this.runtimeData.repoExists = false;
    this.github.repos.get({
         owner: this.config.params.newRepoOwner
        ,repo: this.config.params.newRepoName
    }).then(function(result){
        if(result)
        {
            self.runtimeData.repoExists = true;
            self.controllerCallback("validateRepository",false,new Error("Repository with name: " + self.config.params.newRepoName + " exists in org: " + self.config.params.newRepoOwner));
            return;
        }
        self.runtimeData.repoExists = false;
        self.controllerCallback("validateRepository",true,result);
    }).catch(function(err){
        if(err.code == 404 )
        {
            //Repo wasn't found / doesn't exist
            self.runtimeData.repoExists = false;
            self.controllerCallback("validateRepository",true,err);
        }
        //otherwise, don't do anything
    })



}

Worker.prototype.validateUser = function(username){
    let self = this;
    this.github.users.getForUser({
        username:this.config.params.newRepoRequester
    }).then(function(result){
        self.runtimeData.userValid = true;
        self.controllerCallback("validateUser",true,result);
    }).catch(function(err){
        self.runtimeData.userValid = false;
        self.controllerCallback("validateUser",false,err);
    });
};



Worker.prototype.validateUserInOrg = function(username, orgname)
{
    let self = this;
    if(!this.runtimeData.userValid)
    {
        this.controllerCallback("validateUserInOrg",true,null);
    }

    this.github.orgs.getForUser({
        username: this.config.params.newRepoRequester
    }).then(function(result){
        for(var i = 0;i < result.length;i++) {
            if (result[i].login == self.config.params.newRepoOwner) {
                self.runtimeData.userInOrg = true;
                self.controllerCallback("validateUserInOrg", true, result[i]);
                return;
            }
        }
                self.runtimeData.userInOrg = false;
                self.controllerCallback("validateUserInOrg",false,new Error("User isn't in org"));
                return;
    }).catch(function(err){
        self.runtimeData.userInOrg = false;
        self.controllerCallback("validateUserInOrg",false,err);
    })



}

Worker.prototype.validateOrg = function(orgname){
    let self = this;
    this.github.orgs.get({
        org:this.config.params.newRepoOwner
    }).then(function(result){
        self.runtimeData.orgValid = true;
        self.controllerCallback("validateOrg",true,result);
    }).catch(function(err){
        self.runtimeData.orgValid = false;
        self.controllerCallback("validateOrg",false,err);
    });
};

Worker.prototype.createRepoRequestPRController = function (step, status, result) {

    switch (step) {
        case 'begin':
            this.getPRCommit();
            break;
        case 'getPRCommit':
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                return;
            }
            this.getPRConfigFile();
            break;
        case 'getPRConfigFile':
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                return;
            }
            this.getMasterRef();
            this.getTeamsForOrg();
            break;
        case 'getMasterRef':
        case 'getTeamsForOrg':
            if(!this.runtimeData.createRepoControllerStatus.has(step))
            {
                this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            }
            if(!status)
            {   this.runtimeData.createRepoControllerStatus.exceptions.set(step, result);
                this.createPRComment(result);
                return;
            }
            if(this.runtimeData.createRepoControllerStatus.has('getMasterRef') && this.runtimeData.createRepoControllerStatus.has('getTeamsForOrg'))
            {
                this.createRepo();
            }
            break;
        case 'createRepo':
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                this.createPRComment(result);
                return;
            }
            this.getBranchesForRepo();
            break;
        case 'getBranchesForRepo':
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                this.createPRComment(result);
                return;
            }
            this.createBranches();
            break;
        case 'createBranches':
            //do webhook stuff
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                this.createPRComment(result);
                return;
            }
            this.createWebhooks();
           break;
        case 'createWebhooks':
            this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            if (!status) {
                this.createPRComment(result);
                return;
            }
            this.configureTeams();
            this.configureBranchProtection();
            this.createIssue();
            this.createPRComment();
            this.deleteRequestBranch();
            this.createLabels();
            break;
        case 'configureTeams':
        case 'configureBranchProtection':
        case 'createIssue':
        case 'createPRComment':
        case 'deleteRequestBranch':
        case 'createLabels':
            if(!this.runtimeData.createRepoControllerStatus.has(step))
            {
                this.runtimeData.createRepoControllerStatus.set(step, {"status":status,result});
            }
            if(!status)
            {

                this.runtimeData.createRepoControllerStatus.exceptions.set(step,  result);
            }
 /*safe */           var done = this.runtimeData.createRepoControllerStatus.has('configureTeams')
 /*safe*/               && this.runtimeData.createRepoControllerStatus.has('configureBranchProtection')
 /*safe*/               && this.runtimeData.createRepoControllerStatus.has('createIssue')
                && this.runtimeData.createRepoControllerStatus.has('createPRComment')
                && this.runtimeData.createRepoControllerStatus.has('deleteRequestBranch')
                && this.runtimeData.createRepoControllerStatus.has('createLabels');
            break;
        default:
            break;
    }
};

Worker.prototype.createWebhooks = function ()
{
    var self = this;
    if(!this.runtimeData.repoConfig.webhooks)
    {
        this.controllerCallback('createWebhooks',true,"No webhooks configured");
        return;
    }

    var hooks = this.runtimeData.repoConfig.webhooks;
    var proms = [];
    for(var i = 0;i< hooks.length;i++)
    {
        hooks[i].config.url = hooks[i].config.url;
        proms.push(this.github.repos.createHook({
            owner: this.runtimeData.repository.owner.login
            ,repo: this.runtimeData.repository.name
            ,name:hooks[i].name
            ,config:hooks[i].config
            ,events:hooks[i].events
            ,active:hooks[i].active
    }));
    };

    Promise.all(proms).then(function(result){
        self.controllerCallback('createWebhooks',true,"Webhooks created")
    }).catch(function(err)
    {
        self.controllerCallback('createWebhooks',false,err);
    })
};

Worker.prototype.deleteRequestBranch = function () {
    var self = this;
    const requestBranchRef = this.runtimeData.PR.pull_request.head.ref;
    if (!requestBranchRef) {
        this.controllerCallback('deleteRequestBranch', false, new Error('Could not find request branch ref in PR'));
    }

    this.github.gitdata.deleteReference({
        owner: this.runtimeData.PR.repository.owner.login,
        repo: this.runtimeData.PR.repository.name,
        ref: 'heads/' + requestBranchRef
    }).then(result => {
        self.controllerCallback('deleteRequestBranch', true, result);
}).catch(err => {
        self.controllerCallback('deleteRequestBranch', false, err);
});
};

Worker.prototype.createBranches = function () {
    var self = this;
    if(!this.runtimeData.repoConfig.branches)
    {
        self.controllerCallback('createBranches', true, 'No branches in config');
        return;
    }
    const proms = [];
    if (!this.runtimeData.repoConfig.branches) {
        this.controllerCallback('createBranches', true, null);
    }
    for (let i = 0; i < this.runtimeData.repoConfig.branches.length; i++) {
        const branch = this.runtimeData.repoConfig.branches[i];
        if (branch.name !== 'master') {
            proms.push(this.github.gitdata.createReference(
                {
                    owner: this.runtimeData.repository.owner.login,
                    repo: this.runtimeData.repository.name,
                    ref: 'refs/heads/' + this.runtimeData.repoConfig.branches[i].name,
                    sha: this.runtimeData.repoBranches.get('master').object.sha
                }));
        }
    }
    Promise.all(proms).then(result => {
        self.controllerCallback('createBranches', true, result);
}).catch(err => {
        self.controllerCallback('createBranches', false, err);
});
};

Worker.prototype.getPRConfigFile = function () {
    var self = this;
    this.github.repos.getContent({
        owner: this.runtimeData.PR.repository.owner.login,
        repo: this.runtimeData.PR.repository.name,
        path: this.runtimeData.paramsBLOB.filename,
        ref: this.config.global.repoRequestBranch
    }).then(result => {
        self.config.params = JSON.parse(Buffer.from(result.content, 'base64').toString());
        if (!self.config.repoConfigs.has(self.config.params.newRepoTemplate)) {
            throw new Error('No repository configuration with name ' + self.config.params.newRepoTemplate + ' found.');
        }
        self.runtimeData.repoConfig = self.config.repoConfigs.get(self.config.params.newRepoTemplate);
        self.controllerCallback('getPRConfigFile', true, result);
    }).catch(err => {
            self.controllerCallback('getPRConfigFIle', false, err);
    });
};

Worker.prototype.getPRCommit = function () {
    var self = this;
    this.github.repos.getCommit({
        owner: this.runtimeData.PR.repository.owner.login,
        repo: this.runtimeData.PR.repository.name,
        sha: this.runtimeData.PR.pull_request.merge_commit_sha,
        recursive: true
    }).then(result => {
        if (result.files.length < 1) {
            self.controllerCallback('getPRCommit',"Failure", new Error('Empty commit, no config file, nothing to do'));
    } else if(result.files.length > 1)
    {
        self.controllerCallback('getPRCommit',"Failure", new Error('Multiple files in commit'));
    }
    else {
        // Assume there's only one file in the commit
        self.runtimeData.paramsBLOB = result.files[0];
        self.controllerCallback('getPRCommit', true, result);
    }
    }).catch(err => {
            self.controllerCallback('getPRCommit', false, err);
    });
};

Worker.prototype.createRepositoryRequestPR = function () {
    this.controllerCallback = this.createRepoRequestPRController;
    this.controllerCallback('begin');
};

Worker.prototype.getTeamsForOrg = function () {
    var self = this;
    const proms = [];
    proms.push(this.github.orgs.getTeams({org: this.config.params.newRepoOwner}));
    this.runtimeData.orgTeams = new HashMap();
    Promise.all(proms)
        .then(result => {
            if (result.length > 0) {
                for (let i = 0; i < result[0].length; i++) {
                    self.runtimeData.orgTeams.set(result[0][i].name, result[0][i]);
                    };
                self.controllerCallback('getTeamsForOrg', true, result);
            };
        }).catch(err => {
               if(err.code == 404 ) //Team not found
    {
        self.controllerCallback('getTeamsForOrg',false,new Error("Could not find organization: " + self.config.params.newRepoOwner));
    }
    else
    {
        self.controllerCallback('getTeamsForOrg', false, err);
    }
        });
};

Worker.prototype.createRepo = function (repoConfig) {
    var self = this;
    if(!this.runtimeData.repoConfig && repoConfig)
    {
        this.runtimeData.repoConfig == repoConfig;
    };

    const options = {
        name: this.config.params.newRepoName,
        description: this.runtimeData.repoConfig.repositoryAttributes.description + this.config.global.repoDescriptionSuffix,
        homepage: this.runtimeData.repoConfig.repositoryAttributes.homepage,
        private: this.runtimeData.repoConfig.repositoryAttributes.private,
        has_issues: this.runtimeData.repoConfig.repositoryAttributes.has_issues,
        has_projects: this.runtimeData.repoConfig.repositoryAttributes.has_projects,
        has_wiki: this.runtimeData.repoConfig.repositoryAttributes.has_wiki,
        auto_init: this.runtimeData.repoConfig.repositoryAttributes.auto_init,
        gitignore_template: this.runtimeData.repoConfig.repositoryAttributes.gitignore_template,
        license_template: this.runtimeData.repoConfig.repositoryAttributes.license_template,
        allow_rebase_merge: this.runtimeData.repoConfig.repositoryAttributes.allow_rebase_merge,
        has_downloads: this.runtimeData.repoConfig.repositoryAttributes.has_downloads,
        allow_squash_merge: this.runtimeData.repoConfig.repositoryAttributes.allow_squash_merge,
        allow_merge_commit: this.runtimeData.repoConfig.repositoryAttributes.allow_merge_commit,
        org: this.config.params.newRepoOwner
    };
    this.github.repos.createForOrg(options)
        .then(newRepo => {
            self.runtimeData.repository = newRepo;
            self.controllerCallback('createRepo', true, newRepo);
            return;
        }).catch(err => {
            self.controllerCallback('createRepo', false, err);
        });
};

Worker.prototype.createIssue = function () {
    var self = this;
    this.github.issues.create({
        owner: this.config.params.newRepoOwner,
        repo: this.config.params.newRepoName,
        title: 'Your repository created by repo-template',
        body: 'Your repo-template jobID: ' + this.ID + '.\r\n Check [here](' + this.config.global.callbackURL + 'status?jobID=' + this.ID + '&format=html) for status info.\r\ncc/ @' + this.config.params.newRepoRequester
    }).then(issue => {
        self.controllerCallback('createIssue', true, issue);
    }).catch(err => {
        self.controllerCallback('createIssue', false, err);
    });
};

Worker.prototype.getBranchesForRepo = function () {
    var self = this;
    this.github.gitdata.getReferences({
        owner: this.config.params.newRepoOwner,
        repo: this.config.params.newRepoName
    }).then(repoBranches => {
        self.runtimeData.repoBranches = new HashMap();
        for (let i = 0; i < repoBranches.length; i++) {
            self.runtimeData.repoBranches.set(repoBranches[i].ref.split('/').pop(), repoBranches[i]);
        }

        if (self.runtimeData.repoBranches.has('master')) {
            self.runtimeData.masterCommitSHA = self.runtimeData.repoBranches.get('master').sha;
            }
         self.controllerCallback('getBranchesForRepo', true, repoBranches);
    }).catch(err => {
            self.controllerCallback('getBranchesForRepo', false, err);
    });
};

Worker.prototype.configureTeams = function () {
    var self = this;
    const proms = [];
    let team;
    if (!this.runtimeData.repoConfig.teams) {
        this.controllerCallback('configureTeams', true, null);
        return;
    }
    for (let i = 0; i < this.runtimeData.repoConfig.teams.length; i++) {
        if (this.runtimeData.orgTeams.has(this.runtimeData.repoConfig.teams[i].team)) {
            team = this.runtimeData.orgTeams.get(this.runtimeData.repoConfig.teams[i].team);
            proms.push(
                this.github.orgs.addTeamRepo({
                    id: team.id,
                    org: this.config.params.newRepoOwner,
                    repo: this.runtimeData.repository.name,
                    permission: this.runtimeData.repoConfig.teams[i].permission
                }));
        }
    }
    if(proms.length == 0)
    {
        self.controllerCallback('configureTeams',false, new Error('No teams found in org'));
    }
    else  {
        Promise.all(proms)
            .then(result => {
                self.controllerCallback('configureTeams', true, result);
          }).catch(err => {
            self.controllerCallback('configureTeams', false, err);
    });
    }
};


Worker.prototype.getMasterRef = function () {
    let self = this;
    this.github.gitdata.getReference({
        owner: this.config.global.repoRequestRepo.split('/', 1)[0],
        repo: this.config.global.repoRequestRepo.split('/', 2)[1],
        ref: 'heads/master'
    }).then(result => {
        self.runtimeData.masterCommitSHA = result.object.sha;
        self.runtimeData.requestBranch = 'refs/heads/' + self.config.params.newRepoRequester + '-' + self.config.params.newRepoName + '-' + self.ID;
        self.controllerCallback('getMasterRef', true, result);
    }).catch(err => {
        self.controllerCallback('getMasterRef', false, err);
    });
};

Worker.prototype.createPRBranch = function () {
    let self = this;
    this.github.gitdata.createReference({
        owner: this.config.global.repoRequestRepo.split('/', 1)[0],
        repo: this.config.global.repoRequestRepo.split('/', 2)[1],
        ref: this.runtimeData.requestBranch,
        sha: this.runtimeData.masterCommitSHA
    }).then(result => {
        self.controllerCallback('createPRBranch', true, result);
    }).catch(err => {
        self.controllerCallback('createPRBranch', false, err);
    });
};

Worker.prototype.createPRFile = function () {
    let self = this;
    this.config.params.jobID = this.ID;
    if(!this.config.repoConfigs.has(this.config.params.newRepoTemplate))
    {
        self.controllerCallback("createPRFile",false,new Error("Specified template " + this.config.params.newRepoTemplate + " not found."));
        return;
    }

    this.github.repos.createFile({
        owner: this.config.global.repoRequestRepo.split('/', 1)[0],
        repo: this.config.global.repoRequestRepo.split('/', 2)[1],
        path: 'repo-request-' + this.config.params.newRepoName + "-" + this.config.params.newRepoRequester + "-" + this.ID + '.json',
        message: 'Repository request via repo-template',
        content: Buffer.from(JSON.stringify(this.config.params)).toString('base64'),
        branch: this.runtimeData.requestBranch.split('/')[2]
    }).then(result => {
        self.controllerCallback('createPRFile', true, result);
    }).catch(err => {
        self.controllerCallback('createPRFile', false, err);
    });
};

Worker.prototype.createPR = function () {
    let self = this;
    let notes = '';
    if(!this.runtimeData.userValid)
    {
        notes = '\r\n- Requestors username is not valid\r\n';
    }
    if(!this.runtimeData.orgValid)
    {
        notes = notes + '\r\n- Owning organization is not valid';
    }
    if(!this.runtimeData.userInOrg && this.runtimeData.orgValid && this.runtimeData.userValid)
    {
        notes = notes + '\r\n- Requesting username: ' + this.config.params.newRepoRequester + ' is not a member of owning organization: ' + this.config.params.newRepoOwner + '\r\n-      NOTE: organization membership may be private';
    }
    if(this.runtimeData.repoExists)
    {
        notes = notes + '\r\n- Repository with requested name: ' + this.config.params.newRepoName + " exists at this time.";
    }
    if(notes.length > 0)
    {
        notes = '\r\n### NOTES:\r\n``` diff' + notes + '\r\n```';
    }

    this.runtimeData.notes = notes;
    this.github.pullRequests.create({
        owner: this.config.global.repoRequestRepo.split('/', 1)[0],
        repo: this.config.global.repoRequestRepo.split('/', 2)[1],
        title: 'Repository creation request: ' + this.config.params.newRepoName,
        head: this.runtimeData.requestBranch.split('/')[2],
        base: this.config.global.repoRequestBranch,
        body: 'Repository creation request submitted via chat.  We could optionally include some text here as well from the requester.\n\n### REQUEST:\n\n```JSON  \n' + JSON.stringify(this.config.params).replace(/,/g, '\n,') + '\n```' + notes;
    }).then(result => {
        self.runtimeData.PR = result
        self.controllerCallback('createPR', true, result);
    }).catch(err => {
            self.controllerCallback('createPR', false, err);
    });
};

Worker.prototype.assignPRLabelsAndAssignees = function () {
    let self = this;
    this.runtimeData.assignees = [];
    if(this.config.global.repoRequestPRAssignees && this.config.global.repoRequestPRAssignees.length > 0)
    {
        this.runtimeData.assignees = this.config.global.repoRequestPRAssignees;
    }
    if(this.runtimeData.userValid)
    {
        this.runtimeData.assignees.push(this.config.params.newRepoRequester);
    }
    var labels = JSON.parse(JSON.stringify(this.config.global.repoRequestPRLabels));

    if (this.config.global.repoRequestPRLabels && this.config.global.repoRequestPRLabels.length > 0)		{
        this.github.issues.edit({
            owner: this.config.global.repoRequestRepo.split('/', 1)[0],
            repo: this.config.global.repoRequestRepo.split('/', 2)[1],
            number: this.runtimeData.PR.number,
            title: this.runtimeData.PR.title,
            body: this.runtimeData.PR.body,
            state: this.runtimeData.PR.state,
            milestone: null,
            // ,"labels":JSON.stringify(this.config.repoRequestPRLabels)
            labels: labels,
            assignees: this.runtimeData.assignees
        }).then(result => {
            self.controllerCallback('assignPRLabelsAndAssignees', true, result);
        }).catch(err => {
                self.controllerCallback('assignPRLabelsAndAssignees', false, err);
        });
    }
};

Worker.prototype.createLabels = function()
{
    let self = this;
    var proms = [];
    var params = {};
    if(!this.runtimeData.repoConfig.labels)
    {
        self.controllerCallback('createLabels',true,null);
        return;
    }
    for(var i = 0;i < this.runtimeData.repoConfig.labels.length;i++)
    {
            params.owner = this.config.params.newRepoOwner,
            params.repo = this.runtimeData.repository.name,
            params.name = this.runtimeData.repoConfig.labels[i].name,
            params.color = this.runtimeData.repoConfig.labels[i].color,
            proms.push(this.github.issues.createLabel(params));
    }

    Promise.all(proms)
        .then(result => {
            self.controllerCallback('createLabels', true, result);
      }).catch(err => {
            self.controllerCallback('createLabels', false, err);
      });
};

Worker.prototype.configureBranchProtection = function () {
    let self = this;
    const proms = [];
    let branchConfig;
    if (!this.runtimeData.repoConfig.branches) {
        this.controllerCallback('configureBranchProtection', true, null);
        return;
    }
    for (let i = 0; i < this.runtimeData.repoConfig.branches.length; i++) {
        branchConfig = this.runtimeData.repoConfig.branches[i];
        if(!branchConfig.protection)
        {
            continue;
        }
        const params = JSON.parse(JSON.stringify(branchConfig.protection));
        params.owner = this.runtimeData.repository.owner.login,
            params.repo = this.runtimeData.repository.name,
            params.branch = branchConfig.name
        proms.push(this.github.repos.updateBranchProtection(params));
    }
    Promise.all(proms)
          .then(result => {
          self.controllerCallback('configureBranchProtection', true, result);
        }).catch(err => {
          self.controllerCallback('configureBranchProtection', false, err);
        });
};

Worker.prototype.createPRComment = function (result) {
    let self = this;
    let commentText = '';
    if (!this.runtimeData.PR) {
        this.controllerCallback('createPRComment', false, new Error('No PR found on job'));
        return;
    }

    if (result) {
        commentText = 'There was a problem creating this repository.: ```JSON \r\n' + result.message + "```";
    }

    this.github.issues.createComment({
        owner: this.runtimeData.PR.repository.owner.login,
        repo: this.runtimeData.PR.repository.name,
        number: this.runtimeData.PR.number,
        body: 'Your repo-template jobID: ' + this.ID + '.\r\n Check [here](' + this.config.global.callbackURL + 'status'  + '?jobID=' + this.ID + '&format=html) for status info.\r\n' + commentText
                + (this.runtimeData.repository ? '\r\nClick [here](' + this.runtimeData.repository.html_url + ') to visit your new repository.\r\n\r\ncc: /@' + this.config.params.newRepoRequester : '')
    }).then(comment => {
        self.controllerCallback('createPRComment', true, comment);
    }).catch(err => {
       self.controllerCallback('createPRComment', false, err);
    });
};