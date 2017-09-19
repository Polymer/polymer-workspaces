import exec from './util/exec';

export class NPMSession {
  cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async publish(args = '') {
    return (await exec(this.cwd, `npm publish ${args}`))[0];
  }

  async show(id = '', param = '') {
    return (await exec(this.cwd, `npm show ${id} ${param}`))[0];
  }

  async whoami() {
    return (await exec(this.cwd, 'npm whoami'))[0];
  }
}
