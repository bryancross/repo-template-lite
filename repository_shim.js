/**
 * Created by bryancross on 7/13/18.
 */
const Repo = require('./lib/repository');


var repo = new Repo();
repo.init(process.argv);
repo.getRepoConfig();