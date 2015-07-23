/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_fs = require('fs');
var mod_path = require('path');

var mod_assert = require('assert-plus');
var mod_bunyan = require('bunyan');
var mod_vasync = require('vasync');
var mod_sdc = require('sdc-clients');
var mod_urclient = require('urclient');
var mod_getopt = require('posix-getopt');

var VE = require('verror').VError;

var LOG = mod_bunyan.createLogger({
	name: 'deploy_agents',
	level: process.env.LOG_LEVEL || 'fatal'
});
var URCLIENT;

var SCRIPT_COMMON = [
	'#!/bin/bash',
	'',
	'set -o nounset',
	'set -o errexit',
	'set -o pipefail',
	'',
	'[[ -z $DEPLOY_AGENT_WORKDIR ]] && exit 99',
	'[[ -z $ASSETS_IP ]] && exit 99',
	'[[ -z $AGENT_FILENAME ]] && exit 99',
	''
];

var SCRIPT_MKDIR = SCRIPT_COMMON.concat([
	'mkdir ${DEPLOY_AGENT_WORKDIR}'
]).join('\n');

var SCRIPT_DOWNLOAD = SCRIPT_COMMON.concat([
	'curl -fsS -o "${DEPLOY_AGENT_WORKDIR}/${AGENT_FILENAME}" ' +
	    '"http://${ASSETS_IP}/extra/agents/${AGENT_FILENAME}"'
]).join('\n');

var SCRIPT_INSTALL = SCRIPT_COMMON.concat([
	'cd ${DEPLOY_AGENT_WORKDIR}',
	'bash ${AGENT_FILENAME} >install.log 2>&1'
]).join('\n');

function
create_ur_client(st, next)
{
	mod_assert.object(st.st_rabbitmq, 'st_rabbitmq');

	URCLIENT = mod_urclient.create_ur_client({
		connect_timeout: 5000,
		enable_http: false,
		amqp_config: st.st_rabbitmq,
		log: LOG.child({
			component: 'ur'
		})
	});

	URCLIENT.on('ready', function () {
		next();
	});
}

function
get_server_list(st, next)
{
	mod_assert.string(st.st_cnapi_domain, 'st_cnapi_domain');

	if (!st.st_use_cnapi) {
		console.error('Node List from Arguments: %s',
		    st.st_servers.join(', '));
		next();
		return;
	}

	console.error('Using CNAPI for Node List.');

	var cnapi = new mod_sdc.CNAPI({
		url: 'http://' + st.st_cnapi_domain
	});

	cnapi.listServers({}, function (err, res) {
		if (err) {
			next(new VE(err, 'could not get servers from ' +
			    'CNAPI'));
			return;
		}

		for (var i = 0; i < res.length; i++) {
			var server = res[i];

			mod_assert.object(server, 'server');

			mod_assert.bool(server.setup, 'server.setup');
			if (!server.setup) {
				continue;
			}

			if (st.st_servers.indexOf(server.hostname) === -1) {
				st.st_servers.push(server.hostname);
			}
		}

		if (st.st_servers.length < 3) {
			next(new VE('CNAPI only gave %d servers',
			    st.st_servers.length));
			return;
		}

		next();
	});
}

function
read_config(st, next)
{
	mod_fs.readFile('/usbkey/config', {
		encoding: 'utf8'
	}, function (err, data) {
		if (err) {
			next(new VE(err, 'could not read /usbkey/config'));
			return;
		}

		var lines = data.toString().split(/\n/);
		var rabbitstr;

		for (var i = 0; i < lines.length; i++) {
			var t = lines[i].split('=');

			if (t.length !== 2) {
				continue;
			}

			if (t[0].trim() === 'assets_admin_ip') {
				st.st_assets_ip = t[1].trim();
			} else if (t[0].trim() === 'cnapi_domain') {
				st.st_cnapi_domain = t[1].trim();
			} else if (t[0].trim() === 'rabbitmq') {
				rabbitstr = t[1].trim();
			}
		}

		if (!st.st_assets_ip || !st.st_cnapi_domain ||
		    !rabbitstr) {
			next(new VE('could not find "assets_ip" and ' +
			    '"cnapi_domain" in /usbkey/config'));
			return;
		}

		/*
		 * Parse RabbitMQ configuration.
		 */
		var rabbit = rabbitstr.split(':');
		if (rabbit.length !== 4) {
			next(new VE('invalid rabbitmq: %s', rabbitstr));
			return;
		}

		st.st_rabbitmq = {
			login: rabbit[0],
			password: rabbit[1],
			host: rabbit[2],
			port: Number(rabbit[3])
		};

		next();
	});
}

function
check_agent_installer(st, next)
{
	mod_assert.string(st.st_agent_file, 'st_agent_file');

	var p = mod_path.join('/usbkey/extra/agents', st.st_agent_file);

	mod_fs.lstat(p, function (err, st) {
		if (err) {
			next(new VE(err, 'could not find agent ' +
			    'installer "%s"', p));
			return;
		}

		if (!st.isFile()) {
			next(new VE('agent installer "%s" is not a file',
			    p));
			return;
		}

		next();
	});
}

function
resolve_latest_symlink(st, next)
{
	mod_assert.string(st.st_agent_file, 'st_agent_file');

	if (st.st_agent_file !== 'latest') {
		next();
		return;
	}

	var sl = '/usbkey/extra/agents/latest';
	mod_fs.readlink(sl, function (err, lnk) {
		if (err) {
			next(new VE(err, 'could not resolve "%s"', sl));
			return;
		}

		st.st_agent_file = mod_path.basename(lnk);

		console.error('Agent Shar: %s', st.st_agent_file);
		next();
	});
}

function
run_discovery(st, next)
{
	mod_assert.arrayOfString(st.st_servers, 'st_servers');

	console.error(' ## starting ur discovery...');

	var disco = URCLIENT.discover({
		timeout: 4000,
		exclude_headnode: false,
		node_list: st.st_servers
	});

	var fail = function (err) {
		next(new VE(err, 'ur discovery failed'));
	};

	disco.on('error', fail);
	disco.on('server', function (server) {
		st.st_discos.push(server);
	});
	disco.on('duplicate', function (uuid, hostname) {
		fail(new VE('duplicate host specification ' +
		    'detected: %s/%s', uuid, hostname));
	});
	disco.on('end', function () {
		console.error(' ## ur discovery ok!');
		console.error();
		next();
	});
}

function
gen_path()
{
	return ([
		'/usr/bin',
		'/usr/sbin',
		'/sbin',
		'/smartdc/bin',
		'/opt/smartdc/bin',
		'/opt/local/bin',
		'/opt/local/sbin',
		'/opt/smartdc/agents/bin'
	].join(':'));
}

function
run_command(opts, st, next)
{
	var fails = [];

	mod_assert.object(st, 'st');
	mod_assert.func(next, 'next');

	mod_assert.object(opts, 'opts');
	mod_assert.string(opts.script, 'opts.script');
	mod_assert.string(opts.name, 'opts.name');
	mod_assert.optionalNumber(opts.concurrency, 'opts.concurrency');

	console.error('');
	console.error(' ## TASK: %s', opts.name);
	console.error('');

	/*
	 * Wait 10 minutes for each execution.  Note that this is
	 * per-server, not per phase, so it will not affect a long-running
	 * low-concurrency download operation.
	 */
	var timeout = 10 * 60 * 1000;

	var rq_opts = {
		urclient: URCLIENT,
		timeout: timeout,
		type: 'exec',
		script: opts.script,
		env: {
			PATH: gen_path(),
			HOME: '/root',
			LOGNAME: 'root',
			USER: 'root',
			DEPLOY_AGENT_WORKDIR: st.st_workdir,
			ASSETS_IP: st.st_assets_ip,
			AGENT_FILENAME: st.st_agent_file
		},
		concurrency: opts.concurrency || undefined
	};

	var rq = mod_urclient.create_run_queue(rq_opts);

	var seen = 0;
	rq.on('dispatch', function (server) {
		seen++;
		console.error('   -- running on "%s" (%d of %d)',
		    server.hostname, seen, st.st_discos.length);
	});
	rq.on('success', function (server, result) {
		if (result.exit_status !== 0) {
			console.error('   -- ERROR: command exited %d on ' +
			    '"%s"', result.exit_status, server.hostname);
			console.error('        stderr: %s',
			    result.stderr.trim());
			fails.push(server.hostname);
		} else {
			console.error('   -- success on "%s"',
			    server.hostname);
		}
	});
	rq.on('failure', function (server, error) {
		console.error('   -- failure on "%s"', server.hostname);
		console.error('      %s', error.message);
		fails.push(server.hostname);
	});
	rq.on('end', function () {
		if (fails.length > 0) {
			next(new VE('these hosts failed, causing an ' +
			    'abort: %s', fails.join(', ')));
			return;
		}

		next();
	});

	rq.start();
	st.st_discos.forEach(function (rr) {
		rq.add_server(rr);
	});
	rq.close();
}

function
main(argv)
{
	var parser = new mod_getopt.BasicParser('j:n:', argv);
	var option;

	var st = {
		st_cnapi_domain: null,
		st_assets_ip: null,
		st_rabbitmq: null,

		st_agent_file: null,
		st_download_concurrency: 1,

		st_use_cnapi: true,
		st_servers: [],
		st_discos: [],

		st_datestamp: (new Date()).toISOString(),
		st_workdir: null
	};

	while ((option = parser.getopt()) !== undefined) {
		switch (option.option) {
		case 'n':
			st.st_use_cnapi = false;
			st.st_servers.push(option.optarg);
			break;

		case 'j':
			var x = parseInt(option.optarg, 10);
			if (x < 1 || x > 16) {
				console.error('-j "%s" is not in the ' +
				    'range [1,16]', option.optarg);
				process.exit(1);
			}
			st.st_download_concurrency = x;
			break;

		default:
			mod_assert.strictEqual('?', option.option);
			process.exit(1);
		}
	}

	var posargv = argv.slice(parser.optind());
	if (posargv.length !== 1) {
		console.error('Must specify the agent installer ' +
		    'filename');
		process.exit(1);
	}
	st.st_agent_file = posargv[0];

	st.st_workdir = mod_path.join('/var/tmp', 'DEPLOY_AGENTS.' +
	    st.st_datestamp);
	console.error('Work Directory will be: %s', st.st_workdir);

	mod_vasync.pipeline({
		funcs: [
			read_config,

			resolve_latest_symlink,
			check_agent_installer,

			get_server_list,

			create_ur_client,
			run_discovery,

			run_command.bind(null, {
				name: 'Create Download/Work Directory',
				script: SCRIPT_MKDIR
			}),
			run_command.bind(null, {
				name: 'Download Agent To CN',
				script: SCRIPT_DOWNLOAD,
				concurrency: st.st_download_concurrency
			}),
			run_command.bind(null, {
				name: 'Install Agents on CN',
				script: SCRIPT_INSTALL
			})
		],
		arg: st
	}, function (err) {
		if (err) {
			console.error('ERROR: %s', err.stack);
			process.exit(1);
		}

		console.log('OK, done.');
		process.exit(0);
	});
}

main(process.argv);
