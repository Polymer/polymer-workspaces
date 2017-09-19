import * as path from 'path';

import exec from './util/exec';
import {existsSync} from './util/fs';

export class GitSession {
  cwd: string;
  private exec: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.exec = exec.bind(null, cwd);
  }

  /**
   * Returns true if directory exists and its own git repo.
   */
  isGit(): boolean {
    return existsSync(path.join(this.cwd, '.git'));
  }

  /**
   * Returns the git commit hash at HEAD.
   */
  async getHeadSha(): Promise<string> {
    return (await exec(this.cwd, `git rev-parse HEAD`))[0];
  }

  /**
   * Resets the repo back to a clean state. Note that this deletes any untracked
   * files in the repo directory, created through tooling or otherwise.
   */
  async reset() {
    await exec(this.cwd, `git reset --hard`);
    await exec(this.cwd, `git clean -fd`);
  }

  async clone(url: string) {
    return (await exec(process.cwd(), `git clone ${url} ${this.cwd}`))[0];
  }

  async fetch(remoteName: string = '') {
    return (await exec(this.cwd, `git fetch ${remoteName}`))[0];
  }

  async checkout(branch: string) {
    return (await exec(this.cwd, `git checkout ${branch}`))[0];
  }

  async commit(message: string) {
    return (await exec(this.cwd, `git commit -m ${message}`))[0];
  }

  async push(remoteName: string, branchName: string) {
    return (await exec(this.cwd, `git push ${remoteName} ${branchName}`))[0];
  }

  async addAllFiles() {
    return (await exec(this.cwd, `git add -A`))[0];
  }
}
