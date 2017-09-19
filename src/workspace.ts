/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';

import {GitSession} from './git';
import {GitHubConnection, GitHubRepo, GitHubRepoReference} from './github';
import {mergedBowerConfigsFromRepos} from './util/bower';
import exec from './util/exec';
import {existsSync} from './util/fs';

import _rimraf = require('rimraf');

const rimraf: (dir: string) => void = promisify(_rimraf);

export interface WorkspaceInitOptions {
  fresh?: boolean;
  verbose?: boolean;
}

/**
 * A WorkspaceRepo contains all data to specify the git repo and branch to clone
 * and checkout, as well as necessary supporting information from GitHub and
 * local git clone.
 */
export interface WorkspaceRepo {
  dir: string;
  github: GitHubRepo;
  session: GitSession;
}

export interface GitHubRepoError {
  error: Error;
  ref: GitHubRepoReference;
}

export class Workspace {
  private dir: string;
  private _github: GitHubConnection;

  constructor(options: {token: string, dir: string}) {
    this.dir = options.dir;
    this._github = new GitHubConnection(options.token);
  }

  /**
   * Given the arrays of repos and tests, expand the set (where wildcards are
   * employed) and then reduce the set with excludes, and set the workspace
   * repos appropriately.
   * TODO(usergenic): Should this method explode if it results in no repos to
   * test?
   */
  async _determineWorkspaceRepos(
      repoPatterns: string[], excludes: string[] = []) {
    excludes = excludes.map(String.prototype.toLowerCase);

    let repoRefs: GitHubRepoReference[] =
        await this._github.expandRepoPatterns(repoPatterns);
    repoRefs = repoRefs.filter(
        repoRef => !excludes.includes(repoRef.fullName.toLowerCase()));

    const githubReposMaybe: Array<GitHubRepo|GitHubRepoError> =
        await Promise.all(repoRefs.map(async repoRef => {
          try {
            return await this._github.getRepoInfo(repoRef);
          } catch (err) {
            return {error: err, ref: repoRef};
          }
        }));

    const githubRepos = githubReposMaybe.filter(repoResponse => {
      if ((repoResponse as GitHubRepoError).error) {
        const {fullName} = (repoResponse as GitHubRepoError).ref;
        const {message} = (repoResponse as GitHubRepoError).error;
        console.log(`Repo not found: ${fullName} (${message})`);
        return null;
      }
      return true;
    }) as GitHubRepo[];

    return githubRepos;
  }

  _openWorkspaceRepo(repo: GitHubRepo): WorkspaceRepo {
    const sessionDir = path.resolve(this.dir, repo.name);
    return {
      dir: sessionDir,
      session: new GitSession(sessionDir),
      github: repo,
    };
  }

  /**
   * Cleans up the workspace folder and fixes repos which may be in
   * incomplete or bad state due to previous abandoned runs.
   */
  async _prepareWorkspaceFolders(
      repos: WorkspaceRepo[], options: WorkspaceInitOptions = {}) {
    const workspaceDir = this.dir;

    // Clean up repos when 'fresh' option is true.
    if (options.fresh) {
      if (options.verbose) {
        console.log(`Removing workspace folder ${workspaceDir}...`);
      }
      await rimraf(workspaceDir);
    }

    // Ensure repos folder exists.
    if (!existsSync(workspaceDir)) {
      if (options.verbose) {
        console.log(`Creating workspace folder ${workspaceDir}...`);
      }
      fs.mkdirSync(workspaceDir);
    }

    // If a folder exists for a workspace repo and it can't be opened with
    // nodegit, we need to remove it.  This happens when there's not a --fresh
    // invocation and bower installed the dependency instead of git.
    for (const repo of repos) {
      if (existsSync(repo.dir) && !repo.session.isGit()) {
        if (options.verbose) {
          console.log(`Removing existing folder: ${repo.dir}...`);
        }
        await rimraf(repo.dir);
      }
    }
  }

  /**
   * Given all the repos defined in the workspace, lets iterate through them
   * and either clone them or update their clones and set them to the specific
   * refs.
   */
  async _cloneOrUpdateWorkspaceRepos(repos: WorkspaceRepo[]) {
    // Clone git repos.
    for (const repo of repos) {
      if (repo.session.isGit()) {
        await repo.session.fetch();
        await repo.session.reset();
      } else {
        await repo.session.clone(repo.github.cloneUrl);
      }
      await repo.session.checkout(repo.github.ref);
    }
  }

  /**
   * Creates a .bowerrc that tells bower to use the workspace dir (`.`) as
   * the installation dir (instead of default (`./bower_components`) dir.
   * Creates a bower.json which sets all the workspace repos as dependencies
   * and also includes the devDependencies from all workspace repos under test.
   */
  async _installWorkspaceDependencies(repos: WorkspaceRepo[]) {
    fs.writeFileSync(path.join(this.dir, '.bowerrc'), '{"directory": "."}');

    const bowerConfig = mergedBowerConfigsFromRepos(repos);

    // TODO(usergenic): Verify this is even needed.
    if (!bowerConfig.dependencies['web-component-tester']) {
      bowerConfig.dependencies['web-component-tester'] = '';
    }

    // Make bower config point bower packages of workspace repos to themselves
    // to override whatever any direct or transitive dependencies say.
    for (const repo of repos) {
      const sha = await repo.session.getHeadSha();
      bowerConfig.dependencies[repo.github.name] =
          `./${repo.github.name}#${sha}`;
    }

    fs.writeFileSync(
        path.join(this.dir, 'bower.json'), JSON.stringify(bowerConfig));

    await exec(this.dir, `bower install -F`, {maxBuffer: 1000 * 1024});

    // pb.tick();
  }

  async init(
      patterns: {include: string[], exclude?: string[]},
      options: WorkspaceInitOptions) {
    // Workspace repo map is empty until we determine what they are.
    const githubRepos =
        await this._determineWorkspaceRepos(patterns.include, patterns.exclude);
    const workspaceRepos = githubRepos.map(r => this._openWorkspaceRepo(r));
    // // Clean up the workspace folder and prepare it for repo clones.
    await this._prepareWorkspaceFolders(workspaceRepos, options);
    // // Update in-place and/or clone repositories from GitHub.
    await this._cloneOrUpdateWorkspaceRepos(workspaceRepos);
    // // Bower installs all the devDependencies of test repos also gets wct.
    await this._installWorkspaceDependencies(workspaceRepos);

    return workspaceRepos;
  }

  async run(
      workspaceRepos: WorkspaceRepo[],
      fn: (repo: WorkspaceRepo) => Promise<true|Error>) {
    const successRuns = [];
    const failRuns = new Map();
    for (const workspaceRepo of workspaceRepos) {
      try {
        await fn(workspaceRepo);
        successRuns.push(workspaceRepo);
      } catch (err) {
        failRuns.set(workspaceRepo, err);
      }
    }
    return [successRuns, failRuns];
  }
}
