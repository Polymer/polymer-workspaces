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

/**
 * This file collects all of the functions for interacting with github and
 * manipulating git repositories on the filesystem.
 */

// import Bottleneck from 'bottleneck';
import * as GitHub from 'github';
// import * as nodegit from 'nodegit';
// import * as util from './util';

/**
 * The GitHub API response type for a repository.
 * The type GitHub.Repo is just the repo name.
 */
export interface GitHubRepoReference {
  owner: string;
  name: string;
  fullName: string;
  ref?: string;
}

export interface GitHubRepoCached {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface GitHubRepo extends GitHubRepoReference, GitHubRepoCached {
  ref: string;
}

/**
 * Represents GitHub repository + optional specific branch/ref requested by the
 * tattoo user.
 */
// export interface GitHubRepoRef extends GitHubRepo {
//   // The branch name or SHA of the commit to checkout in the clone.
//   checkoutRef?: string;
// }

/**
 * @returns true if the response is a redirect to another repo
 */
function isRedirect(response: any): boolean {
  return !!(response.meta && response.meta.status.match(/^301\b/));
}

function formatGitHubRepoFromApi(obj: any): GitHubRepoCached {
  return {
    owner: obj.owner.login,
    name: obj.name,
    fullName: obj.full_name,
    cloneUrl: obj.clone_url,
    defaultBranch: obj.default_branch
  };
}

function fullNameToGithubRepoReference(pattern: string): GitHubRepoReference {
  const hashSplit = pattern.split('#');
  const slashSplit = hashSplit[0].split('/');

  if (slashSplit.length !== 2 || hashSplit.length > 2) {
    throw new Error(
        `Repo '${pattern}' is not in form user/repo or user/repo#ref`);
  }

  return {
    fullName: hashSplit[0],
    owner: slashSplit[0],
    name: slashSplit[1],
    ref: hashSplit[1] || undefined
  };
}

// function fullNameToGithubRepoReference(fullName: string): GitHubRepoReference
// {
//   const splitName = fullName.split('/');
//   return {
//     owner: splitName[0],
//     name: splitName[1],
//     fullName,
//   };
// }

/**
 * GitHubConnection is a wrapper class for the GitHub npm package that
 * assumes action as-a-user, and a minimal set of supported API calls (mostly
 * to do with listing and cloning owned repos) using a token and building in
 * rate-limiting functionality using the Bottleneck library to throttle API
 * consumption.
 */
export class GitHubConnection {
  private _cache: Map<string, GitHubRepoCached>;
  // private _cloneOptions: nodegit.CloneOptions;
  // private _cloneRateLimiter: Bottleneck;
  private _github: GitHub;
  private _token: string;
  // private _user: GitHub.Username;

  constructor(token: string) {
    this.resetCache();
    this._token = token;
    this._github = new GitHub({
      // version: '3.0.0',
      protocol: 'https'
    });
    this._github.authenticate({type: 'oauth', token: token});
    // TODO: Make the arguments to rate limiter configurable.
    // this._cloneRateLimiter = new Bottleneck(20, 100);
    // this._cloneOptions = {
    //   fetchOpts: {
    //     callbacks: {
    //       certificateCheck() {
    //         return 1;
    //       },
    //       credentials(_url: string, _userName: string) {
    //         return nodegit.Cred.userpassPlaintextNew(token, 'x-oauth-basic');
    //       }
    //     }
    //   }
    // };
  }

  resetCache() {
    this._cache = new Map();
  }

  // /**
  //  * Given a github repository and a directory to clone it into, return an
  //  * ElementRepo once it has been cloned and checked out.  If the clone
  //  already
  //  * exists, fetch the latest updates from the remote repository.
  //  * TODO(usergenic): Split this into two methods?
  //  */
  // async cloneOrFetch(githubRepo: GitHubRepo, cloneDir: string):
  //     Promise<nodegit.Repository> {
  //   if (util.existsSync(cloneDir)) {
  //     const openRepo = await nodegit.Repository.open(cloneDir);
  //     if (openRepo) {
  //       return await this._cloneRateLimiter
  //           .schedule(() => openRepo.fetchAll(this._cloneOptions.fetchOpts))
  //           .then(() => openRepo);
  //     }
  //   }
  //   return await this._cloneRateLimiter.schedule(() => {
  //     return nodegit.Clone.clone(
  //         githubRepo.clone_url, cloneDir, this._cloneOptions);
  //   });
  // }

  // TODO(fks): ref is not set in the cache, but is instead applied through
  // this method. Cache should be of some other, similar type

  /**
   * @returns a representation of a github repo from a string version
   */
  async getRepoInfo(repoReference: GitHubRepoReference): Promise<GitHubRepo> {
    const cachedRepo = this._cache.get(repoReference.fullName);
    if (cachedRepo !== undefined) {
      const repo = Object.assign(
          {}, cachedRepo, {ref: repoReference.ref || cachedRepo.defaultBranch});
      return repo;
    }
    const repoRef = fullNameToGithubRepoReference(repoReference.fullName);
    const response = await this._github.repos.get(
        {owner: repoRef.owner, repo: repoRef.name});
    // TODO(usergenic): Patch to _handle_ redirects and/or include
    // details in error messaging.  This was encountered because we
    // tried to request Polymer/hydrolysis which has been renamed to
    // Polymer/polymer-analyzer and the API doesn't auto-follow this.
    if (isRedirect(response)) {
      console.log('Repo ${owner}/${repo} has moved permanently.');
      console.log(response);
      throw new Error(
          `Repo ${repoRef.owner}/${repoRef.name} could not be loaded.`);
    }
    const gitHubRepoCached = formatGitHubRepoFromApi(response.data);
    this._cache.set(repoReference.fullName, gitHubRepoCached);
    const repo = Object.assign({}, gitHubRepoCached, {
      ref: repoReference.ref || gitHubRepoCached.defaultBranch
    });
    return repo;
  }

  /**
   * @returns an array of repo (full_name) values for the given owner (which is
   * either an org or user on github.)
   */
  async getOwnerRepos(owner: string): Promise<GitHubRepoCached[]> {
    // Try to get the repo names assuming owner is an org.
    const allRepos: GitHubRepoCached[] = [];
    let pageRepos: GitHubRepoCached[] = [];
    const pageSize = 50;
    let page = 0;
    let isOrg = true;

    do {
      if (isOrg) {
        try {
          const response = await this._github.repos.getForOrg(
              {org: owner, per_page: pageSize, page: page});
          pageRepos = response.data.filter((obj: any) => !obj.private)
                          .map(formatGitHubRepoFromApi);
        } catch (e) {
          // Maybe owner is not an org.
          isOrg = false;
        }
      }
      if (!isOrg) {
        try {
          const response = await this._github.repos.getForUser(
              {username: owner, per_page: pageSize, page: page});
          pageRepos = response.data.filter((obj: any) => !obj.private)
                          .map(formatGitHubRepoFromApi);
        } catch (e) {
          pageRepos = [];
        }
      }
      for (const repo of pageRepos) {
        this._cache.set(repo.fullName, repo);
        allRepos.push(repo);
      }
      ++page;
    } while (pageRepos.length > 0);

    return allRepos;
  }

  /**
   * Given a collection of GitHubRepoRefs, replace any that represent wildcard
   * values with the literal values after comparing against names of repos on
   * GitHub.  So a repo ref like `Polymer/*` return everything owned by
   * Polymer where `PolymerElements/iron-*` would be all repos that start with
   * `iron-` owned by `PolymerElements` org.
   */
  async expandRepoPatterns(repoPatterns: string[]):
      Promise<GitHubRepoReference[]> {
    const allGitHubRepos: Set<GitHubRepoReference> = new Set();
    const ownersToLookup: Set<string> = new Set();

    for (const repoPattern of repoPatterns) {
      if (!repoPattern.match(/\//)) {
        console.log(
            `WARNING: repo "${repoPattern}" must be of the ` +
            `GitHub format "owner/repo". Ignoring...`);
        continue;
      }
      if (repoPattern.match(/\*/)) {
        ownersToLookup.add(repoPattern);
      } else {
        allGitHubRepos.add(fullNameToGithubRepoReference(repoPattern));
      }
    }

    if (ownersToLookup.size === 0) {
      return [...allGitHubRepos];
    }

    await Promise.all([...ownersToLookup].map((pattern): Promise<void> => {
      return (async () => {
        const owner = pattern.substring(0, pattern.indexOf('/')).toLowerCase();
        const ref = pattern.includes('#') &&
            pattern.substring(pattern.indexOf('#') + 1);
        const ownerCachedRepos = await this.getOwnerRepos(owner);
        console.log('AHHH', owner, ownerCachedRepos);
        ownerCachedRepos.forEach(cachedRepo => {
          allGitHubRepos.add({
            owner: cachedRepo.owner,
            name: cachedRepo.name,
            fullName: cachedRepo.fullName,
            ref: ref || cachedRepo.defaultBranch
          });
        });
      })();
    }));

    return Array.from(allGitHubRepos);
  }
}

/**
 * @returns a GitHubRepoRef resulting from the parsed string of the form:
 *     `ownerName/repoName[#checkoutRef]`
 */
// export function parseGitHubRepoRefString(refString: string): GitHubRepoRef {
//   const hashSplit = refString.split('#');
//   const slashSplit = hashSplit[0].split('/');

//   if (slashSplit.length !== 2 || hashSplit.length > 2) {
//     throw new Error(
//         `Repo '${refString}' is not in form user/repo or user/repo#ref`);
//   }

//   const owner = slashSplit[0];
//   const repo = slashSplit[1];
//   const ref = hashSplit[1];

//   return {ownerName: owner, repoName: repo, checkoutRef: ref};
// }

/**
 * @returns whether the matcherRef matches the targetRef, which allows for the
 *     case-insensitive match as well as wildcards.
 * TODO(usergenic): This method intentionally doesn't match the checkout refs
 * of two repo refs.  We'll need this method to support an option to do so in
 * order to support wildcard exclude and skip-tests options to filter out items
 * by checkout refs.
 */
// export function matchRepoRef(
//     matcherRef: GitHubRepoRef, targetRef: GitHubRepoRef): boolean {
//   return util.wildcardRegExp(matcherRef.ownerName!)
//              .test(targetRef.ownerName!) &&
//       util.wildcardRegExp(matcherRef.repoName!).test(targetRef.repoName!);
// }
