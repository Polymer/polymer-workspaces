/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
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

import Bottleneck from 'bottleneck';

/**
 * A local rate-limitter optimized for the GitHub API. If you're worried
 * about spamming a batch of requests through GitHub, execute them via
 * `githubApiLimiter.schedule()`.
 */
export const githubApiLimitter = new Bottleneck(12);

/**
 * A local rate-limitter optimized for cloning/updating local git repos.
 * If you're worried about spamming a batch of `git clone`s at once,
 * execute them via `localGitLimitter.schedule()`.
 */
export const localGitLimitter = new Bottleneck(14);