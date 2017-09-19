import {Workspace} from '../lib/workspace';
const path = require('path');

const ws = new Workspace({
  token: '3a97161835cc4c920c768b9300cb85259b952fce',
  dir: path.resolve('.workspace')
});

(async () => {
  try {
    const result = await ws.init(
        {
          include: [
            'Polymer/polymer#2.0-preview',
          ]
        },
        {verbose: true});
    console.log(result);
  } catch (err) {
    console.log('AH!', err);
  }
})();
