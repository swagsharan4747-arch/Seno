const { Client, GatewayIntentBits, AuditLogEvent, PermissionsBitField } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// OWNER IDs
const OWNERS = [
"1405447087423885312",
"1233006477959102580",
"938513493487931392"
];

// LOG CHANNEL IDs
const LOG_CHANNEL_IDS = [
"1477921118693097553",
"1466278768191471854",
"1456663591771181130"
];

// Bad words
const badWords = [
"gomma","punda","thevudiya","sunni","gotha","gay","lesbian",
"fuck","suthu","ass","fucker","umbu","motherfucker","sucker",
"asshole","omala","kuthie","mairu","otha","thevidiya"
];

const messageTracker = new Map();
const emojiTracker = new Map();
const channelTracker = new Map();

client.once("ready", () => {
  console.log(`🔥 Security Bot Online as ${client.user.tag}`);
});

// Protected users
function isProtected(member){

  if(OWNERS.includes(member.id)) return true;

  if(
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) return true;

  return false;

}

// Send logs
async function sendLog(guild,msg){

  for(const id of LOG_CHANNEL_IDS){

    const channel = await guild.channels.fetch(id).catch(()=>null);

    if(channel) channel.send(msg);

  }

}

// Timeout user
async function timeoutUser(member,reason){

  if(!member.moderatable) return;

  await member.timeout(10 * 60 * 1000,reason);

  sendLog(
    member.guild,
`⏳ TIMEOUT
User: ${member.user.tag}
Reason: ${reason}`
  );

}

// Ban user
async function banUser(member,reason){

  if(!member.bannable) return;

  await member.ban({reason});

  sendLog(
    member.guild,
`🔨 BANNED
User: ${member.user.tag}
Reason: ${reason}`
  );

}

// Message Protection
client.on("messageCreate", async message => {

  if(!message.guild || message.author.bot) return;

  const member = message.member;

  if(isProtected(member)) return;

  const text = message.content.toLowerCase();

  // Link rule
  if(text.includes("http://") || text.includes("https://") || text.includes("www.")){

    await message.delete().catch(()=>{});

    return timeoutUser(member,"Sending Links");

  }

  // Bad word rule
  if(badWords.some(word => text.includes(word))){

    const bad = badWords.find(word => text.includes(word));

    await message.delete().catch(()=>{});

    sendLog(
      message.guild,
`⚠️ Bad Word Deleted
User: ${message.author.username}
Message: ${bad}`
    );

    return;

  }

  // EMOJI SPAM (3 emoji messages within 5 seconds)

  const emojiMatches = message.content.match(/[\p{Emoji}]/gu);

  if(emojiMatches){

    const id = member.id;

    if(!emojiTracker.has(id)) emojiTracker.set(id,[]);

    const data = emojiTracker.get(id);

    data.push({
      msg: message,
      time: Date.now()
    });

    const filtered = data.filter(m => Date.now() - m.time < 5000);

    emojiTracker.set(id,filtered);

    if(filtered.length >= 3){

      for(const m of filtered){
        m.msg.delete().catch(()=>{});
      }

      emojiTracker.delete(id);

      return timeoutUser(member,"Emoji Spam");

    }

  }

  // SPAM PROTECTION

  const id = member.id;

  if(!messageTracker.has(id)) messageTracker.set(id,[]);

  const data = messageTracker.get(id);

  data.push({
    msg: message,
    content: message.content,
    time: Date.now()
  });

  const filtered = data.filter(m => Date.now() - m.time < 5000);

  messageTracker.set(id,filtered);

  // FAST MESSAGE SPAM (3 messages in 5 seconds)

  if(filtered.length >= 3){

    for(const m of filtered){
      m.msg.delete().catch(()=>{});
    }

    messageTracker.delete(id);

    return timeoutUser(member,"Fast Message Spam");

  }

  // DUPLICATE MESSAGE SPAM

  const same = filtered.filter(m => m.content === message.content);

  if(same.length >= 4){

    for(const m of same){
      m.msg.delete().catch(()=>{});
    }

    messageTracker.delete(id);

    return timeoutUser(member,"Duplicate Message Spam");

  }

});

// Anti Bot Add

client.on("guildMemberAdd", async member => {

  if(!member.user.bot) return;

  const logs = await member.guild.fetchAuditLogs({
    type:AuditLogEvent.BotAdd,
    limit:1
  });

  const entry = logs.entries.first();

  if(!entry) return;

  const executor = await member.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  await executor.ban({reason:"Unauthorized Bot Addition"});

  if(member.kickable){
    await member.kick("Unauthorized Bot");
  }

  sendLog(
    member.guild,
`🚨 BOT ADD VIOLATION
Banned: ${executor.user.tag}
Removed Bot: ${member.user.tag}`
  );

});

// Channel spam protection

async function handleChannel(channel,type){

  const logs = await channel.guild.fetchAuditLogs({
    type: type === "create"
    ? AuditLogEvent.ChannelCreate
    : AuditLogEvent.ChannelDelete,
    limit:1
  });

  const entry = logs.entries.first();

  if(!entry) return;

  const executor = await channel.guild.members.fetch(entry.executor.id);

  if(isProtected(executor)) return;

  if(!channelTracker.has(executor.id)){
    channelTracker.set(executor.id,[]);
  }

  const actions = channelTracker.get(executor.id);

  actions.push(Date.now());

  const filtered = actions.filter(t => Date.now() - t < 5000);

  channelTracker.set(executor.id,filtered);

  if(filtered.length > 3){

    await executor.ban({reason:"Channel Spam / Abuse"});

    sendLog(
      channel.guild,
`📁 CHANNEL ABUSE
User: ${executor.user.tag} banned`
    );

    channelTracker.delete(executor.id);

  }

}

client.on("channelCreate",c => handleChannel(c,"create"));
client.on("channelDelete",c => handleChannel(c,"delete"));

client.login(process.env.TOKEN);
