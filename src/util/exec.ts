import {ExecOptions} from 'child_process';
const {promisify} = require('util');
const {exec: _exec} = require('child_process');
const exec = promisify(_exec);

// lookupAsync('nodejs.org')
//     .then(obj => console.log(obj));
// // { address: '104.20.23.46', family: 4 }

export default async function(
    cwd: string, command: string, options?: ExecOptions):
    Promise<[string, string]> {
  const commandOptions = Object.assign({}, options, {cwd});
  const {stdout, stderr} = await exec(command, commandOptions);
  return [stdout.toString('utf8').trim(), stderr.toString('utf8').trim()];
}
