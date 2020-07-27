import { Command } from "../../Templates/Command/Command";
import { CommandDetail } from "../../Templates/Command/CommandDetail";
import { CommandPermission } from "../../Templates/Command/CommandPermission";
import { Message, MessageEmbed, EmojiResolvable, GuildEmoji, ReactionEmoji, Emoji, Guild, GuildChannel, Role, TextChannel } from "discord.js";
import { IRaidGuild } from "../../Templates/IRaidGuild";
import { MessageUtil } from "../../Utility/MessageUtil";
import { FastReactionMenuManager } from "../../Classes/Reaction/FastReactionMenuManager";
import { TimeUnit } from "../../Definitions/TimeUnit";
import { GenericMessageCollector } from "../../Classes/Message/GenericMessageCollector";
import { MongoDbHelper } from "../../Helpers/MongoDbHelper";
import { setTimeout } from "timers";
import { ISection } from "../../Templates/ISection";
import { GuildUtil } from "../../Utility/GuildUtil";
import { IApplication } from "../../Definitions/IApplication";
import { OtherUtil } from "../../Utility/OtherUtil";
import { StringUtil } from "../../Utility/StringUtil";

export class ConfigureApplicationCommand extends Command {
	private static MAX_QUESTIONS: number = 35;

	private readonly _emojiToReaction: EmojiResolvable[] = [
		"1⃣", // main
		"2⃣",
		"3⃣",
		"4⃣",
		"5⃣",
		"6⃣",
		"7⃣",
		"8⃣",
		"9⃣", // 8th section
		"🔟"
	];

	public constructor() {
		super(
			new CommandDetail(
				"Configure Leader Application Command",
				"configleaderapps",
				["configapps", "configapp"],
				"Configures the leader application system.",
				["configleaderapps"],
				["configleaderapps"],
				0
			),
			new CommandPermission(
				["BAN_MEMBERS"],
				["EMBED_LINKS"],
				["officer", "moderator", "headRaidLeader"],
				[],
				false
			),
			true,
			false,
			false
		);
	}

	// TODO only accept ign
	public async executeCommand(
		msg: Message,
		args: string[],
		guildDb: IRaidGuild
	): Promise<void> {
		this.mainMenu(msg, guildDb);
	}

	public async mainMenu(msg: Message, guildDb: IRaidGuild, botMsg?: Message): Promise<void> {
		if (typeof botMsg !== "undefined") {
			await botMsg.reactions.removeAll().catch(e => { });
		}

		const introEmbed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle("Configure Applications")
			.setDescription("Use this command to add, remove, or edit applications. Applications are a good way to assess a person's interest in many areas, whether that be raid leading or moderation.");
		const reactions: EmojiResolvable[] = [];

		if (guildDb.properties.application.length + 1 <= 5) {
			introEmbed.addField("Create New Application", "React with ➕ if you would like to create a new application.");
			reactions.push("➕");
		}

		if (guildDb.properties.application.length !== 0) {
			introEmbed
				.addField("Edit Application", "React with ⚙️ if you would like to edit or delete an application.")
			reactions.push("⚙️");
		}

		introEmbed
			.addField("Exit", "React with ❌ if you would like to exit this process.")
			.setFooter("Application Manager");
		reactions.push("❌");

		botMsg = typeof botMsg === "undefined"
			? await msg.channel.send(introEmbed)
			: await botMsg.edit(introEmbed);

		const selectedReaction: GuildEmoji | ReactionEmoji | "TIME_CMD" = await new FastReactionMenuManager(
			botMsg,
			msg.author,
			reactions,
			5,
			TimeUnit.MINUTE
		).react();

		if (selectedReaction === "TIME_CMD") {
			return;
		}

		if (selectedReaction.name === "➕") {
			this.createNewApp(msg, guildDb, botMsg);
		}
		else if (selectedReaction.name === "⚙️") {
			const app: "CANCEL_CMD" | "BACK_CMD" | IApplication = await this.getApplication(msg, guildDb, botMsg);
			if (app === "BACK_CMD") {
				this.mainMenu(msg, guildDb, botMsg);
				return;
			}
			else if (app === "CANCEL_CMD") {
				await botMsg.delete().catch(e => { });
				return;
			}
			this.editApp(msg, guildDb, app, botMsg);
		}
		else {
			await botMsg.delete().catch(e => { });
			return;
		}
	}

	public async editApp(msg: Message, guildDb: IRaidGuild, app: IApplication, botMsg: Message): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });
		const guild: Guild = msg.guild as Guild;
		const channel: GuildChannel | undefined = guild.channels.cache.get(app.channel);
		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle(`Application: **${app.name}**`)
			.setDescription(`Enabled: ${app.isEnabled ? "Active" : "Inactive"}\nQuestions: ${app.questions.length}\nChannel: ${typeof channel === "undefined" ? "N/A" : channel}`)
			.setFooter(`${app.name}`)
			.addField("Go Back", "React with ⬅️ if you want to go back to the previous menu.")
			.addField(`${app.isEnabled ? "Disable" : "Enable"} Application`, `React with 🔔 if you want to ${app.isEnabled ? "disable" : "enable"} this application.`)
			.addField("Change Name", "React with 📝 if you want to change the name for this application.")
			.addField("Edit Question(s)", "React with ❓ if you want to edit the application questions. You may add, remove, or edit questions.")
			.addField("Edit Channel", "React with #️⃣ if you want to change the channel where responses will be sent to.")
			.addField("Delete Application", "React with 🗑️ if you want to delete this application.")
			.addField("Cancel Process", "React with ❌ if you want to cancel this process.")
			.setFooter("Application Editor.");
		await botMsg.edit(embed).catch(e => { });
		const reactions: EmojiResolvable[] = ["⬅️", "📝", "🔔", "❓", "#️⃣", "🗑️", "❌"];
		FastReactionMenuManager.reactFaster(botMsg, reactions);

		const selectedReaction: GuildEmoji | ReactionEmoji | "TIME_CMD" = await new FastReactionMenuManager(
			botMsg,
			msg.author,
			reactions,
			5,
			TimeUnit.MINUTE
		).react();

		if (selectedReaction === "TIME_CMD") {
			return;
		}

		// back
		if (selectedReaction.name === "⬅️") {
			this.mainMenu(msg, guildDb, botMsg);
			return;
		}
		// edit name
		else if (selectedReaction.name === "📝") {
			this.changeName(msg, guildDb, app, botMsg);
			return;
		}
		// enable/disable
		else if (selectedReaction.name === "🔔") {
			await botMsg.reactions.removeAll().catch(e => { });
			guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: guild.id, "properties.application.name": app.name }, {
				$set: {
					"properties.application.$.isEnabled": !app.isEnabled
				}
			}, { returnOriginal: false })).value as IRaidGuild;
			const newIndex: number = guildDb.properties.application.findIndex(x => x.name === app.name);
			this.editApp(msg, guildDb, guildDb.properties.application[newIndex], botMsg);
			return;
		}
		// questions
		else if (selectedReaction.name === "❓") {
			await botMsg.reactions.removeAll().catch(e => { });
			this.questionTime(msg, guildDb, app, botMsg, false);
			return;
		}
		// channel
		else if (selectedReaction.name === "#️⃣") {
			this.changeChannel(msg, guildDb, app, botMsg);
			return;
		}
		// delete
		else if (selectedReaction.name === "🗑️") {
			await botMsg.reactions.removeAll().catch(e => { });
			const deleteApp: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle("Delete Application")
				.setDescription(`Are you sure you want to delete the application, \`${app.name}\`? `)
				.setFooter("Confirmation");
			await botMsg.edit(deleteApp).catch(e => { });
			const checkXReactions: EmojiResolvable[] = ["✅", "❌"];
			const resultantReaction: Emoji | "TIME_CMD" = await new FastReactionMenuManager(
				botMsg,
				msg.author,
				checkXReactions,
				1,
				TimeUnit.MINUTE
			).react();

			if (resultantReaction === "TIME_CMD" || resultantReaction.name === "❌") {
				this.editApp(msg, guildDb, app, botMsg);
				return;
			}

			guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: guild.id }, {
				$pull: {
					"properties.application": {
						name: app.name
					}
				}
			})).value as IRaidGuild;
			this.mainMenu(msg, guildDb, botMsg);
			return;
		}
		// cancel
		else {
			await botMsg.delete().catch(e => { });
			return;
		}
	}

	private async questionTime(msg: Message, guildDb: IRaidGuild, app: IApplication, botMsg: Message, needToReact: boolean): Promise<void> {
		let questions: string[] = app.questions;

		const reactions: EmojiResolvable[] = ["⬅️", "➕"];
		if (questions.length !== 0) {
			reactions.push("➖");
		}
		if (questions.length > 1) {
			reactions.push("🔃");
		}
		reactions.push("💾", "❌");

		await botMsg.edit(this.generateEmbed(msg, app, questions)).catch(e => { });
		if (!needToReact) {
			FastReactionMenuManager.reactFaster(botMsg, reactions);
		}

		const selectedReaction: GuildEmoji | ReactionEmoji | "TIME_CMD" = await new FastReactionMenuManager(
			botMsg,
			msg.author,
			reactions,
			5,
			TimeUnit.MINUTE
		).react();

		if (selectedReaction === "TIME_CMD") {
			return;
		}

		if (selectedReaction.name === "⬅️") {
			this.editApp(msg, guildDb, app, botMsg);
			return;
		}
		else if (selectedReaction.name === "➕") {
			this.addOrEditQuestion(msg, guildDb, app, questions, botMsg, "ADD");
			return;
		}
		else if (selectedReaction.name === "➖") {
			this.deleteQuestion(msg, guildDb, app, questions, botMsg);
			return;
		}
		else if (selectedReaction.name === "🔃") {
			this.swapQuestions(msg, guildDb, app, questions, botMsg);
			return;
		}
		else if (selectedReaction.name === "💾") {
			await botMsg.reactions.removeAll().catch(e => { });
			guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: (msg.guild as Guild).id, "properties.application.name": app.name }, {
				$set: {
					"properties.application.$.questions": questions
				}
			}, { returnOriginal: false })).value as IRaidGuild;
			const newIndex: number = guildDb.properties.application.findIndex(x => x.name === app.name);
			this.editApp(msg, guildDb, guildDb.properties.application[newIndex], botMsg);
			return;
		}
		else {
			botMsg.delete().catch(e => { });
			return;
		}
	}

	private async addQuestion(msg: Message, db: IRaidGuild, app: IApplication, questions: string[], botMsg: Message, position: number): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });

		let positionStr: string = position === 0
			? "the front"
			: position === questions.length - 1
				? "the end"
				: `question **\`${position + 1}\`**`;

		let qs: string[] = [];
		let hasReactedToMessage: boolean = false;
		while (true) {
			const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle(`**${app.name}** ⇒ Editing Questions ⇒ Adding Question(s)`)
				.setDescription(`${qs.length === 0 ? "N/A" : qs.join("\n")}\n\nYou may add up to 8 questions (200 characters each), starting at ${positionStr + 1}. Split each question with a bar: \`|\`.\n⇒ React with ⬅️ to go back to the previous menu.\n⇒ React with ✅ to save the questions.\n⇒ React with ❌ to cancel this process.`)
				.setFooter("Adding Questions.");
			const fields: string[] = StringUtil.arrayToStringFields<string>(
				questions,
				(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
			);
			for (const f of fields) {
				embed.addField("Questions", f);
			}
			await botMsg.edit(embed).catch(e => { });

			const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
				msg.author,
				{ embed: embed },
				10,
				TimeUnit.MINUTE,
				msg.channel
			).sendWithReactCollector(GenericMessageCollector.getStringPrompt(msg.channel, { minCharacters: 1, maxCharacters: 50 }), {
				reactions: ["⬅️", "✅", "❌"],
				cancelFlag: "--cancel",
				reactToMsg: !hasReactedToMessage,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (!hasReactedToMessage) {
				hasReactedToMessage = !hasReactedToMessage;
			}


			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return;
				}
				else if (response.name === "⬅️") {
					this.addOrEditQuestion(msg, db, app, questions, botMsg, "ADD");
					return;
				}
				else {
					if (questions.length !== 0) {
						break;
					}
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(() => { });
					return;
				}
				qs.push(...response.split("|").map(x => x.trim()));
			}
		}

		if (position === 0) {
			app.questions.unshift(...qs);
		}
		else if (position === questions.length - 1) {
			app.questions.push(...qs);
		}
		else {
			app.questions.splice(position, 0, ...qs);
		}
		db = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: db.guildID, "properties.application.name": app.name }, {
			$set: {
				"properties.application.$.questions": app.questions
			}
		}, { returnOriginal: false })).value as IRaidGuild;
		this.questionTime(msg, db, app, botMsg, true);
	}

	private async editQuestion(msg: Message, db: IRaidGuild, app: IApplication, questions: string[], botMsg: Message, position: number): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });

		let q: string = "";
		let hasReactedToMessage: boolean = false;
		while (true) {
			const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle(`**${app.name}** ⇒ Editing Questions ⇒ Edit Question`)
				.setDescription(`${q.length === 0 ? "N/A" : q}\n\nYou are currently editing question **\`${position + 1}\`**. Your edited question can be up to 200 characters long.\n⇒ React with ⬅️ to go back to the previous menu.\n⇒ React with ✅ to save the questions.\n⇒ React with ❌ to cancel this process.`)
				.setFooter("Adding Questions.");
			const fields: string[] = StringUtil.arrayToStringFields<string>(
				questions,
				(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
			);
			for (const f of fields) {
				embed.addField("Questions", f);
			}
			await botMsg.edit(embed).catch(e => { });

			const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
				msg.author,
				{ embed: embed },
				10,
				TimeUnit.MINUTE,
				msg.channel
			).sendWithReactCollector(GenericMessageCollector.getStringPrompt(msg.channel, { minCharacters: 1, maxCharacters: 50 }), {
				reactions: ["⬅️", "✅", "❌"],
				cancelFlag: "--cancel",
				reactToMsg: !hasReactedToMessage,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (!hasReactedToMessage) {
				hasReactedToMessage = !hasReactedToMessage;
			}

			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return;
				}
				else if (response.name === "⬅️") {
					this.addOrEditQuestion(msg, db, app, questions, botMsg, "ADD");
					return;
				}
				else {
					if (questions.length !== 0) {
						break;
					}
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(() => { });
					return;
				}
				q = response;
			}
		}

		app.questions[position] = q;
		db = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: db.guildID, "properties.application.name": app.name }, {
			$set: {
				"properties.application.$.questions": app.questions
			}
		}, { returnOriginal: false })).value as IRaidGuild;
		this.questionTime(msg, db, app, botMsg, true);
	}

	private async addOrEditQuestion(msg: Message, db: IRaidGuild, app: IApplication, questions: string[], botMsg: Message, qType: "ADD" | "EDIT"): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });

		let desc: string = qType === "ADD"
			? "Please type the location where the new question(s) should be added.\n⇒ React with ⬅️ if you want to go back.\n⇒ React with 🇫 if you want to put the question(s) at the front of the application.\n⇒ React with 🇧 if you want to put the question(s) at the end of the application.\nOtherwise, type the number corresponding to the position where you want to put the question. Any questions after that will be shifted."
			: "Please type the location of the question you want to edit.\n⇒ React with ⬅️ if you want to go back.\n⇒ React with 🇫 if you want to edit the first question.\n⇒ React with 🇧 if you want to edit the last question.\nOtherwise, type the number corresponding to the question that you want to edit.";

		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle(`**${app.name}** ⇒ Editing Questions ⇒ ${qType === "ADD" ? "Add" : "Edit"} Question`)
			.setDescription(desc)
			.setFooter("Select Position.");
		const fields: string[] = StringUtil.arrayToStringFields<string>(
			questions,
			(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
		);

		for (const field of fields) {
			embed.addField("Questions", field);
		}

		await botMsg.edit(embed).catch(e => { });
		let numToUse: number = -1;
		const response: number | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<number>(
			msg.author,
			{ embed: embed },
			10,
			TimeUnit.MINUTE,
			msg.channel
		).sendWithReactCollector(GenericMessageCollector.getNumber(msg.channel, 1, questions.length), {
			reactions: ["⬅️", "🇫", "🇧"],
			cancelFlag: "--cancel",
			reactToMsg: true,
			deleteMsg: false,
			removeAllReactionAfterReact: true,
			oldMsg: botMsg
		});

		if (response === "CANCEL_CMD" || response === "TIME_CMD") {
			botMsg.delete().catch(e => { });
			return;
		}

		if (response instanceof Emoji) {
			if (response.name === "🇧") {
				numToUse = 0;
			}
			else if (response.name === "🇫") {
				numToUse = questions.length - 1;
			}
			else {
				this.questionTime(msg, db, app, botMsg, true);
				return;
			}
		}
		else {
			numToUse = response - 1;
		}

		if (qType === "ADD") {
			this.addQuestion(msg, db, app, questions, botMsg, numToUse);
			return;
		}
		else {

		}
	}

	private async deleteQuestion(msg: Message, db: IRaidGuild, app: IApplication, questions: string[], botMsg: Message): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });
		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle(`**${app.name}** ⇒ Editing Questions ⇒ Delete Question`)
			.setDescription("Please type the number corresponding to the question you want to delete. Choose carefully; you won't be able to undo your action.\n\n⇒ React with ⬅️ to go back to the previous menu.\n⇒ React with ❌ to cancel this process.")
			.setFooter("Delete Questions.");

		const fields: string[] = StringUtil.arrayToStringFields<string>(
			questions,
			(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
		);

		for (const elem of fields) {
			embed.addField("Questions", elem);
		}

		await botMsg.edit(embed).catch(e => { });

		const response: number | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<number>(
			msg,
			{ embed: embed },
			2,
			TimeUnit.MINUTE
		).sendWithReactCollector(GenericMessageCollector.getNumber(msg.channel, 1, questions.length), {
			reactions: ["⬅️", "❌"],
			cancelFlag: "-cancel",
			reactToMsg: true,
			deleteMsg: false,
			removeAllReactionAfterReact: false,
			oldMsg: botMsg
		});

		if (response === "CANCEL_CMD" || response === "TIME_CMD") {
			botMsg.delete().catch(e => { });
			return;
		}
		else if (response instanceof Emoji) {
			if (response.name === "⬅️") {
				this.questionTime(msg, db, app, botMsg, true);
				return;
			}
			else {
				botMsg.delete().catch(e => { });
				return;
			}
		}
		else {
			questions.splice(response - 1, 1);
			app.questions = questions;
			this.questionTime(msg, db, app, botMsg, true);
			return;
		}
	}

	private async swapQuestions(msg: Message, db: IRaidGuild, app: IApplication, questions: string[], botMsg: Message): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });

		let hasReactedToMessage: boolean = false;
		let nums: [number, number] = [-1, -1];
		while (true) {
			const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle(`**${app.name}** ⇒ Editing Questions ⇒ Switching Questions`)
				.setDescription(`Q1: ${nums[0] === -1 ? "N/A" : questions[nums[0]]}\nQ2: ${nums[1] === -1 ? "N/A" : questions[nums[1]]}\n\nPlease type two numbers corresponding to the questions you want to swap around. For example, valid inputs could be \`1 10\` or \`15 2\`.\n\n⇒ React with ⬅️ to go back to the previous menu.\n⇒ React with ✅ to confirm that you want to switch the above two questions.\n⇒ React with ❌ to cancel this process.`)
				.setFooter("Delete Questions.");

			const fields: string[] = StringUtil.arrayToStringFields<string>(
				questions,
				(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
			);

			for (const elem of fields) {
				embed.addField("Questions", elem);
			}
			await botMsg.edit(embed).catch(e => { });

			const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
				msg.author,
				{ embed: embed },
				10,
				TimeUnit.MINUTE,
				msg.channel
			).sendWithReactCollector(GenericMessageCollector.getStringPrompt(msg.channel, { minCharacters: 3 }), {
				reactions: ["✅", "❌"],
				cancelFlag: "--cancel",
				reactToMsg: !hasReactedToMessage,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (!hasReactedToMessage) {
				hasReactedToMessage = !hasReactedToMessage;
			}

			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return;
				}
				else if (response.name === "⬅️") {
					this.editApp(msg, db, app, botMsg);
					return;
				}
				else {
					if (nums[0] !== -1 && nums[1] !== -1) {
						break;
					}
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(() => { });
					return;
				}

				try {
					const parsed: number[] = response.split(" ")
						.map(x => Number.parseInt(x))
						.filter(x => !Number.isNaN(x))
						.map(x => x - 1);
					if (parsed.length === 2 && (0 <= parsed[0] && parsed[0] < questions.length) && (0 <= parsed[1] && parsed[1] < questions.length)) {
						nums[0] = parsed[0];
						nums[1] = parsed[1];
					}
				}
				catch (e) {

				}
			}
		} // end while

		let temp: string = questions[nums[0]];
		questions[nums[0]] = questions[nums[1]];
		questions[nums[1]] = temp;
		app.questions = questions;
		this.questionTime(msg, db, app, botMsg, true);
	}

	private generateEmbed(msg: Message, app: IApplication, questions: string[]): MessageEmbed {
		let desc: string = "";
		desc += `⇒ React with ⬅️ to go back to the previous menu. Your changes won't be saved.\n⇒ React with ➕ to add one or more question(s) to the application.`;
		if (questions.length !== 0) {
			desc += "\n⇒ React with ➖ to delete a question.";
		}
		if (questions.length > 1) {
			desc += `\n⇒ React with 🔃 to switch two questions around.`;
		}
		desc += `\n⇒ React with 💾 to save your application.\n⇒ React with ❌ to cancel this entire process.`;

		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle(`**${app.name}** ⇒ Editing Questions`)
			.setDescription(`There are currently \`${app.questions.length}\`/${ConfigureApplicationCommand.MAX_QUESTIONS} questions, which are displayed below.\n\n${desc}`)
			.setFooter(`${app.name}`);
		const fields: string[] = StringUtil.arrayToStringFields<string>(
			questions,
			(i, elem) => `**\`[${i + 1}]\`** ${elem}\n`
		);

		for (const field of fields) {
			embed.addField("Questions", field);
		}
		return embed;
	}


	// TODO use one function to change every little detail instead of
	// copying code

	private async changeChannel(msg: Message, guildDb: IRaidGuild, app: IApplication, botMsg: Message): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });
		const guild: Guild = msg.guild as Guild;

		let channel: TextChannel | undefined;
		let hasReactedToMessage: boolean = false;
		while (true) {
			const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle(`**${app.name}** ⇒ Change Channel`)
				.setDescription("Please type the channel that you want to use for this application. Any applications will be sent to this channel where it can be reviewed. The channel preview is below.\n\n⇒ React with ⬅️ if you want to go back to the previous menu.\n⇒ React with ✅ if you want to use the channel below.\n⇒ React with ❌ if you want to cancel.")
				.setFooter("Application Editor.");
			await botMsg.edit(embed).catch(e => { });

			const response: TextChannel | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<TextChannel>(
				msg.author,
				{ embed: embed },
				10,
				TimeUnit.MINUTE,
				msg.channel
			).sendWithReactCollector(GenericMessageCollector.getChannelPrompt(msg, msg.channel), {
				reactions: ["✅", "❌"],
				cancelFlag: "--cancel",
				reactToMsg: !hasReactedToMessage,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (!hasReactedToMessage) {
				hasReactedToMessage = !hasReactedToMessage;
			}

			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return;
				}
				else if (response.name === "⬅️") {
					this.editApp(msg, guildDb, app, botMsg);
					return;
				}
				else {
					if (typeof channel !== "undefined") {
						break;
					}
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(() => { });
					return;
				}
				channel = response;
			}
		}

		guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: guild.id, "properties.application.name": app.name }, {
			$set: {
				"properties.application.$.channel": channel.id
			}
		}, { returnOriginal: false })).value as IRaidGuild;
		const newIndex: number = guildDb.properties.application.findIndex(x => x.name === app.name);
		this.editApp(msg, guildDb, guildDb.properties.application[newIndex], botMsg);
	}

	private async changeName(msg: Message, guildDb: IRaidGuild, app: IApplication, botMsg: Message): Promise<void> {
		await botMsg.reactions.removeAll().catch(e => { });
		const guild: Guild = msg.guild as Guild;
		const allAppNames: string[] = guildDb.properties.application.map(x => x.name.toLowerCase());

		let title: string = "";
		let hasReactedToMessage: boolean = false;
		while (true) {
			const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
				.setTitle(`**${app.name}** ⇒ Change Name`)
				.setDescription("Please type the name that you want to use for this application. The name preview is below. Your name must not be more than 50 characters long and must not be used by another application.\n\n⇒ React with ⬅️ if you want to go back to the previous menu.\n⇒ React with ✅ if you want to use the name below.\n⇒ React with ❌ if you want to cancel.")
				.setFooter("Application Editor.");
			await botMsg.edit(embed).catch(e => { });

			const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
				msg.author,
				{ embed: embed },
				10,
				TimeUnit.MINUTE,
				msg.channel
			).sendWithReactCollector(GenericMessageCollector.getStringPrompt(msg.channel, { minCharacters: 1, maxCharacters: 50 }), {
				reactions: ["✅", "❌"],
				cancelFlag: "--cancel",
				reactToMsg: !hasReactedToMessage,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (!hasReactedToMessage) {
				hasReactedToMessage = !hasReactedToMessage;
			}


			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return;
				}
				else if (response.name === "⬅️") {
					this.editApp(msg, guildDb, app, botMsg);
					return;
				}
				else {
					if (title.length !== 0) {
						break;
					}
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(() => { });
					return;
				}
				if (!allAppNames.includes(title.toLowerCase())) {
					title = response;
				}
			}
		}

		guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: guild.id, "properties.application.name": app.name }, {
			$set: {
				"properties.application.$.name": title
			}
		}, { returnOriginal: false })).value as IRaidGuild;
		const newIndex: number = guildDb.properties.application.findIndex(x => x.name === title);
		this.editApp(msg, guildDb, guildDb.properties.application[newIndex], botMsg);
	}

	private async createNewApp(msg: Message, guildDb: IRaidGuild, botMsg: Message): Promise<void> {
		const allAppNames: string[] = guildDb.properties.application.map(x => x.name.toLowerCase());

		await botMsg.reactions.removeAll().catch(e => { });

		let title: string = "";
		// we have members
		let reactToMsg: boolean = true;
		// see who to remove
		while (true) {
			const titleEmbed: MessageEmbed = new MessageEmbed()
				.setAuthor(msg.author.tag, msg.author.displayAvatarURL())
				.setTitle("Creating New Application")
				.setDescription(`Current Title: ${title === "" ? "N/A" : title}\n\nType the name of this application. The name must not have already been used; if it has, the new title won't appear above. Furthermore, the name must not be more than 50 characters.\n\nReact with ✅ if you are satisfied with the name above. React with the ❌ to cancel this process completely.`)
				.setFooter("Title for Application.");

			await botMsg.edit(titleEmbed).catch(e => { });

			const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
				msg,
				{ embed: titleEmbed },
				2,
				TimeUnit.MINUTE
			).sendWithReactCollector(GenericMessageCollector.getStringPrompt(msg.channel, { minCharacters: 1, maxCharacters: 50 }), {
				reactions: ["✅", "❌"],
				cancelFlag: "-cancel",
				reactToMsg: reactToMsg,
				deleteMsg: false,
				removeAllReactionAfterReact: false,
				oldMsg: botMsg
			});

			if (reactToMsg) {
				reactToMsg = false;
			}

			if (response instanceof Emoji) {
				if (response.name === "❌") {
					await botMsg.delete().catch(e => { });
					return
				}
				else {
					break;
				}
			}
			else {
				if (response === "CANCEL_CMD" || response === "TIME_CMD") {
					await botMsg.delete().catch(e => { });
					return;
				}

				if (!allAppNames.includes(title.toLowerCase())) {
					title = response;
				}
			}
		}
		await botMsg.reactions.removeAll().catch(e => { });

		guildDb = (await MongoDbHelper.MongoDbGuildManager.MongoGuildClient.findOneAndUpdate({ guildID: guildDb.guildID }, {
			$push: {
				"properties.application": {
					isEnabled: false,
					name: title,
					questions: [],
					channel: ""
				}
			}
		}, { returnOriginal: false })).value as IRaidGuild;

		const confirmEmbed: MessageEmbed = new MessageEmbed()
			.setAuthor(msg.author.tag, msg.author.displayAvatarURL())
			.setTitle("Application Created")
			.setDescription(`Your application, named \`${title}\`, has been created. It is currently disabled and no questions have been provided. To manage this application, please edit the application.`)
			.setFooter("Too Many Applications!");
		await botMsg.edit(confirmEmbed).catch(e => { });
		setTimeout(async () => {
			this.mainMenu(msg, guildDb, botMsg);
		}, 5 * 1000);
		return;
	}

	private async getApplication(
		msg: Message,
		guildData: IRaidGuild,
		botMsg: Message
	): Promise<IApplication | "BACK_CMD" | "CANCEL_CMD"> {
		const guild: Guild = (msg.guild as Guild);
		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(guild)
			.setTitle(`**Select Application**`)
			.setColor("RANDOM")
			.setAuthor(msg.author.tag, msg.author.displayAvatarURL())
			.setFooter("Application Selection.")
			.setDescription("Please react to the emoji corresponding to the application that you want to configure.\n⇒ React with ⬅️ if you want to go back to the main menu.\n⇒ React with ❌ if you want to cancel this entire process.");

		const reactions: EmojiResolvable[] = ["⬅️", "❌"];

		for (let i = 0; i < guildData.properties.application.length; i++) {
			reactions.push(this._emojiToReaction[i]);
			const app: { isEnabled: boolean; name: string; questions: string[]; } = guildData.properties.application[i];
			embed.addField(`**\`[${i + 1}]\`** ${app.name}`, `Questions: ${app.questions.length}\nStatus: ${app.isEnabled ? "Active" : "Inactive"}`);
		}

		await botMsg.edit(embed).catch(e => { });
		const selectedReaction: Emoji | "TIME_CMD" = await new FastReactionMenuManager(
			botMsg,
			msg.author,
			reactions,
			2,
			TimeUnit.MINUTE
		).react();

		if (selectedReaction === "TIME_CMD" || selectedReaction.name === "❌") {
			return "CANCEL_CMD";
		}

		if (selectedReaction.name === "⬅️") {
			return "BACK_CMD";
		}

		const selectedIndex: number = this._emojiToReaction.findIndex(x => x === selectedReaction.name);
		if (selectedIndex === -1) {
			return "CANCEL_CMD";
		}

		return guildData.properties.application[selectedIndex];
	}
}