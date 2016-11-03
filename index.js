var Promise = require('bluebird'),
  path = require('path'),
  glob = require('glob'),
  debug = require('debug')('protractor-cucumber-framework'),
  Cucumber = require('cucumber'),
  state = require('./lib/runState');

/**
 * Execute the Runner's test cases through Cucumber.
 *
 * @param {Runner} runner The current Protractor Runner.
 * @param {Array} specs Array of Directory Path Strings.
 * @return {Promise} Promise resolved with the test results
 */
exports.run = function(runner, specs) {

  var results = {};
  var cucumberRunnerCmd = ['node', 'cucumberjs'];
  var cucumberOpts = runner.getConfig().cucumberOpts;
  var resultCapturerParam = ['--require', path.resolve(__dirname, 'lib', 'resultsCapturer.js')];

  return runner.runTestPreparer().then(function() {
    state.initialize(runner, results, cucumberOpts.strict);

    return new Promise(function(resolve, reject) {
      var cliArguments = [].concat(cucumberRunnerCmd);
      convertOptionsToCliArguments(cliArguments);
      cliArguments = cliArguments.concat(resultCapturerParam).concat(specs);

      debug('cucumber command: "' + cliArguments.join(' ') + '"');

      Cucumber.Cli(cliArguments).run(function (isSuccessful) {
        var numberRerunAttempts = browser.params.rerun;
        if (!isSuccessful && numberRerunAttempts) {
          var rerunArgs = getRerunArgs();
          rerunArgs = rerunArgs.concat(resultCapturerParam);
          return rerun(numberRerunAttempts, rerunArgs, resolve, reject);
        } else {
          return onCompleteResolveOrReject(resolve, reject)
        }
      });
    });
  });

  function getRerunArgs() {
    var rerunArgs = [];
    var rerunFilePath = browser.params.rerunFilePath;

    if (rerunFilePath === 'null') throw new Error(rerunFilePath, ' is not a valid Cucumber rerun file.');

    convertOptionsToCliArguments(rerunArgs);
    var args = cucumberRunnerCmd.concat(rerunFilePath).concat(rerunArgs);

    return args;
  }

  function rerun(numRetryAttempts, rerunArgs, resolve, reject) {
    if (numRetryAttempts > 0) {
      debug('Re-running failing scenarios with command: ', rerunArgs.join(' '));
      Cucumber.Cli(rerunArgs).run(function(isSuccessful) {
        if (!isSuccessful) {
        return rerun(numRetryAttempts - 1, rerunArgs, resolve, reject);
      } else {
        return onCompleteResolveOrReject(resolve, reject);
      }
    });
    } else {
      return onCompleteResolveOrReject(resolve, reject);
    }
  }

  function onCompleteResolveOrReject(resolve, reject) {
    var complete = Promise.resolve();

    if (runner.getConfig().onComplete) {
      complete = runner.getConfig().onComplete();
    }

    return complete.then(function() {
      return resolve(results);
    }).catch(function() {
      return reject();
    });
  }

  function convertOptionsToCliArguments(cliArguments) {
    for (var option in cucumberOpts) {
      var cliArgumentValues = convertOptionValueToCliValues(option, cucumberOpts[option]);

      if (Array.isArray(cliArgumentValues)) {
        cliArgumentValues.forEach(function (value) {
          cliArguments.push('--' + option, value);
        });
      } else if (cliArgumentValues) {
        cliArguments.push('--' + option);
      }
    }
  }

  function convertRequireOptionValuesToCliValues(values) {
    var configDir = runner.getConfig().configDir;

    return toArray(values).map(function(path) {
      // Handle glob matching
      return glob.sync(path, {cwd: configDir});
    }).reduce(function(opts, globPaths) {
      // Combine paths into flattened array
      return opts.concat(globPaths);
    }, []).map(function(requirePath) {
      // Resolve require absolute path
      return path.resolve(configDir, requirePath);
    }).filter(function(item, pos, orig) {
      // Make sure requires are unique
      return orig.indexOf(item) == pos;
    });
  }

  function convertGenericOptionValuesToCliValues(values) {
    if (values === true || !values) {
      return values;
    } else {
      return toArray(values);
    }
  }

  function convertOptionValueToCliValues(option, values) {
    if (option === 'require') {
      return convertRequireOptionValuesToCliValues(values);
    } else {
      return convertGenericOptionValuesToCliValues(values);
    }
  }

  function toArray(values) {
    return Array.isArray(values) ? values : [values];
  }
};
