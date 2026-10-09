'use strict';

exports.Uri = { file: (fsPath) => ({ fsPath, toString: () => 'file://' + fsPath }) };
