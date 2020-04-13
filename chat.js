const readline = require('readline');
const chalk = require('chalk');

const hyperswarm = require('hyperswarm');
const crypto = require('crypto');

const kappa = require('kappa-core');
const memdb = require('memdb');
const list = require('kappa-view-list');

const pump = require('pump');

if (!process.argv[2]) {
	console.error('Please, provide `username@topic`');
	return -1;
}
const [me, topic] = process.argv[2].split('@');
if (!me || !topic) {
	console.error('Please, provide `username@topic`');
	return -1;
}

const system = 'system';

const logs = [];
process.stdout.write('\x1Bc');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

let rowsDisplayed = rl.output.rows - 4;
rl.output.on('resize', () => {
	rowsDisplayed = rl.output.rows - 4
});

const swarm = hyperswarm();
const discoveryKey = crypto.createHash('sha256')
	.update(topic)
	.digest();

logs.push(`${chalk.dim('Discovery Key: ')}${discoveryKey.toString('hex')}`);

const view = list(memdb(), (msg, next) => {
	if (msg.value.timestamp && typeof msg.value.timestamp === 'string') {
		next(null, [msg.value.timestamp]);
	} else {
		next();
	}
});

const core = kappa(`./.dat/${discoveryKey.toString('hex')}-${Buffer.from(me).toString('hex')}`, {
	valueEncoding: 'json',
});
core.use('chats', view);

core.on('feed', (feed) => {
	//logs.push(chalk.dim(`${(feed.writable) ? 'Writable' : 'Readable'} feed added (${feed.key.toString('hex')})`));

	feed.createReadStream({ live: true })
		.on('data', ({ timestamp, username, data }) => {
			formatMessage(timestamp, username, data);
		});
});

core.api.chats.tail(rowsDisplayed, (messages) => {
	process.stdout.write('\x1Bc');
	logs.forEach((log) => {
		rl.output.write(`${log}\n`);
	});
	rl.output.write('\n');
	messages.forEach((message) => {
		rl.output.write(`${formatMessage(message)}\n`);
	});
	rl.output.cursorTo(0, rowsDisplayed + 2);
	rl.prompt();
});

core.writer('local', (err, feed) => {
	feed.append({
		type: 'chat-message',
		timestamp: new Date().toISOString(),
		data: `${me} joining ${topic}`,
		username: system,
	});

	rl.on('line', (line) => {
		const timestamp = new Date().toISOString();
		const data = line.toString().trim();

		feed.append({
			type: 'chat-message',
			timestamp,
			data,
			username: me,
		});
	});
});

swarm.join(discoveryKey, { lookup: true, announce: true });

swarm.on('connection', (socket, info) => {
	/* if (info.client) {
		logs.push(chalk.dim(`Peer@${info.peer.host}:${info.peer.port}`));
	} */

	pump(socket, core.replicate(info.client, { live: true }), socket);
});

function formatMessage({ value: { timestamp, username, data } }) {
	if (username === system) {
		username = chalk.yellow(username);
		data = chalk.grey(data);
	}
	if (username === me) {
		username = chalk.blue(username);
	}
	return `${chalk.dim(timestamp)} ${username}: ${data}`;
}
