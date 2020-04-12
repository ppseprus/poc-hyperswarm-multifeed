const readline = require('readline');
const chalk = require('chalk');

const hyperswarm = require('hyperswarm');
const crypto = require('crypto');
const multifeed = require('multifeed');
const pump = require('pump');

if (!process.argv[2]) {
	return -1;
}
const [ username, discoveryKey ] = process.argv[2].split('@');
if (!username || !discoveryKey) {
	return -1;
}

const messages = [];
let rowsDisplayed = 25;

process.stdout.write('\x1Bc');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

rowsDisplayed = rl.output.rows - 2;
rl.output.on('resize', () => {
	rowsDisplayed = rl.output.rows - 2
});

const multi = multifeed(`./.dat/multichat-${username}`, {
	valueEncoding: 'json',
});

multi.on('feed', (feed) => {
	messages.push(chalk.dim(`${(feed.writable) ? 'Writable' : 'Readable'} feed added (${feed.key.toString('hex')})`));
	refreshScreen();

	feed.createReadStream({ live: true })
		.on('data', ({ timestamp, username, data }) => {
			formatMessage(timestamp, username, data);
			refreshScreen();
		});
});

multi.writer('local', (err, feed) => {
	rl.on('line', (line) => {
		const timestamp = new Date().toISOString();
		const data = line.toString().trim();

		feed.append({
			type: 'chat-message',
			timestamp,
			data,
			username,
		});
	});
});

const swarm = hyperswarm();
const topic = crypto.createHash('sha256')
	.update(discoveryKey)
	.digest();

swarm.join(topic, { lookup: true, announce: true });

swarm.on('connection', (socket, info) => {
	if (info.client) {
		messages.push(chalk.dim(`Peer@${info.peer.host}:${info.peer.port}`));
	}

	pump(socket, multi.replicate(info.client, { live: true }), socket);
});

function formatMessage(timestamp, username, data) {
	messages.push(`${chalk.dim(timestamp)} ${username}: ${data}`);
}

function refreshScreen() {
	process.stdout.write('\x1Bc');
	messages.slice(- rowsDisplayed).forEach((line) => {
		rl.output.write(`${line}\n`);
	});
	rl.output.cursorTo(0, rowsDisplayed + 2);
	rl.prompt();
}
