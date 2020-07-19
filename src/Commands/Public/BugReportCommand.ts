import { Command } from "../../Templates/Command/Command";
import { CommandDetail } from "../../Templates/Command/CommandDetail";
import { CommandPermission } from "../../Templates/Command/CommandPermission";
import { Message, ClientUser, Client, DMChannel, MessageEmbed, Emoji, User } from "discord.js";
import { IRaidBot } from "../../Templates/IRaidBot";
import { MongoDbHelper } from "../../Helpers/MongoDbHelper";
import { UserAvailabilityHelper } from "../../Helpers/UserAvailabilityHelper";
import { GenericMessageCollector } from "../../Classes/Message/GenericMessageCollector";
import { TimeUnit } from "../../Definitions/TimeUnit";
import { GithubHandler } from "../../Helpers/GithubHandler";
import { DEVELOPER_ID, PRODUCTION_BOT } from "../../Configuration/Config";
import { BOT_VERSION } from "../../Constants/ConstantVars";
import { MessageUtil } from "../../Utility/MessageUtil";

export class BugReportCommand extends Command {
    public constructor() {
        super(
            new CommandDetail(
                "Bug Report Command",
                "bugreport",
                [],
                "Lets you report a bug to the developers.",
                ["bugreport"],
                ["bugreport"],
                0
            ),
            new CommandPermission(
                [],
                [],
                [],
                [],
                true
            ),
            false, // guild-only command. 
            false,
            false
        );
    }

	private readonly _questions: string[][] = [
		// general idea AKA title
		["What is the general idea of this bug report?", "The general idea is a short \"summary\" (preferably less than 10 words) of what your report is about. This should NOT be an essay; that will be for later. Examples of valid submissions are:\n- \"AFK check dungeon menu not responding\"\n- \"Blacklist doesn't blacklist all alts.\"\n- \"The bot isn't sending modmail.\"\n\nExamples of invalid submissions are:\n- \"The bot broke\"\n- \"Please help\""],
		["Please provide any error message(s).", "If the bot provided any error messages or other responses that seem out of place (with respect to the command itself), please list them. If not, simply respond with \`None\`."],
		["Where did this bug occur?", "Please specify where the bug occurred. For example, if the bug occurred in a command, type the command name. If the bug occurred during an AFK check, say \"AFK check.\" Please be descriptive."],
		["Please provide a description of this bug.", "Now is the time for you to write a description of the bug. **Be as descriptive as possible!** Use this opportunity to describe what the bug does. Include information like what you expected the bot to do and what actually happened. The more descriptive you are, the fast the bug will be fixed.\n\nAn example of a valid submission is:\n- \"When the bot asked me to specify a dungeon for the AFK check, I chose \"5.\" However, the bot didn't respond.\""],
		["Please provide steps to reproduce this bug.", "This is your opportunity to tell me, the developer, how you came across this bug. Use this opportunity to tell me what you did that led up to the bug happening; in other words, tell me what bot commands or features you used *prior* to the bug happening. This part should be the longest part of this report, and should take a bit of time. Again, **be as descriptive as possible!**\n\nWhen writing the steps, please be sure to number them. For example, I'll provide a valid submission below.\n1. Run the AFK check command with no arguments.\n2. Specify the location.\n3. Select the section. In my case, I used the \"Endgame\" section.\n4. Select a dungeon. In my case, I chose Void.\n5. Done."],
		["Any other details?", "Provide any other useful or notable details."]
	];

	public async executeCommand(
		msg: Message,
		args: string[]
	): Promise<void> {
		let dmChannel: DMChannel;
        try {
            dmChannel = await msg.author.createDM();
        }
        catch (e) {
            await msg.channel.send(`${msg.member}, I cannot DM you. Please make sure your privacy settings are set so anyone can send messages to you.`).catch(() => { });
            return;
        }
		let botDb: IRaidBot = await MongoDbHelper.MongoBotSettingsClient
			.findOne({ botId: (msg.client.user as ClientUser).id }) as IRaidBot;
		
		if (typeof botDb.dev === "undefined") {
			botDb = (await MongoDbHelper.MongoBotSettingsClient.findOneAndUpdate({ botId: (msg.client.user as ClientUser).id }, {
				$set: {
					dev: {
						isEnabled: true,
						bugs: [],
						feedback: [],
						blacklisted: []
					}
				}
			}, { returnOriginal: false })).value as IRaidBot;
		}

		if (!botDb.dev.isEnabled) {
			await msg.author.send("At this time, the developer is not accepting bug reports.");
			return;
		}

		if (botDb.dev.blacklisted.some(x => x === msg.author.id)) {
			await msg.author.send("You are not able to submit bug reports to the developer.");
			return;
		}

		UserAvailabilityHelper.InMenuCollection.set(msg.author.id, UserAvailabilityHelper.MenuType.BUG_REPORT);
		let botMsg: Message | undefined;
		const responses: string[][] = [];
		let initialCreated: boolean = false; 
		for await (const question of this._questions) {
			let answer: string = "";
			let hasReactedToMessage: boolean = false;
			while (true) {
				const embed: MessageEmbed = this.generateEmbed(msg.author, question[0], answer, question[1]);
				if (typeof botMsg === "undefined") {
					botMsg = await dmChannel.send(embed);
				}
				else {
					botMsg = await botMsg.edit(embed);
				}

				if (!initialCreated) {
					await botMsg.edit(embed).catch(e => { });
				}
	
				const response: string | Emoji | "CANCEL_CMD" | "TIME_CMD" = await new GenericMessageCollector<string>(
					msg.author,
					{ embed: embed },
					10,
					TimeUnit.MINUTE,
					dmChannel
				).sendWithReactCollector(GenericMessageCollector.getStringPrompt(dmChannel), {
					reactions: ["✅", "❌"],
					cancelFlag: "--cancel",
					reactToMsg: !hasReactedToMessage,
					deleteMsg: false,
					removeAllReactionAfterReact: false,
					oldMsg: botMsg
				});
	
				if (hasReactedToMessage) {
					hasReactedToMessage = !hasReactedToMessage;
				}
	
				if (response instanceof Emoji) {
					if (response.name === "❌") {
						await botMsg.delete().catch(e => { });
						UserAvailabilityHelper.InMenuCollection.delete(msg.author.id);
						return;
					}
					else {
						if (answer.length !== 0) {
							break;
						}
					}
				}
				else {
					if (response === "CANCEL_CMD" || response === "TIME_CMD") {
						await botMsg.delete().catch(() => { });
						UserAvailabilityHelper.InMenuCollection.delete(msg.author.id);
						return;
					}
	
					answer = response;
				}

			} // end while loop
			await botMsg.delete().catch(e => { });
			botMsg = undefined;
			responses.push([question[0], answer]);
		} // end for

		let bugReport: GithubHandler.IBugReport = {
			time: new Date().getTime(),
			authorId: DEVELOPER_ID.includes(msg.author.id) ? (PRODUCTION_BOT ? "Developer" : "Developer Testing") : msg.author.id,
			authorTag: DEVELOPER_ID.includes(msg.author.id) ? (PRODUCTION_BOT ? "Developer" : "Developer Testing") : msg.author.tag,
			version: BOT_VERSION,
			title: `[BUG REPORT] ${responses[0][1]}`,
			errorMsg: responses[1][1],
			location: responses[2][1],
			description: responses[3][1],
			reproduceSteps: responses[4][1],
			otherInfo: responses[5][1]
		}

		let resp: GithubHandler.IssuesResponse = await GithubHandler.createIssue("BUG_REPORT", bugReport);
		await MongoDbHelper.MongoBotSettingsClient.updateOne({ botId: (msg.client.user as ClientUser).id }, {
			$push: {
				"dev.bugs": bugReport
			}
		});

		UserAvailabilityHelper.InMenuCollection.delete(msg.author.id);

		const embed: MessageEmbed = MessageUtil.generateBlankEmbed(msg.author)
			.setTitle("Bug Report Submitted Successfully")
			.setDescription("Thank you for submitting your bug report! It has been submitted successfully.")
			.addField("Information", `- Database: Saved\n- Online: ${resp === GithubHandler.IssuesResponse.SUCCESS ? "Saved" : "Not Saved"}`)
			.setFooter("Successfully Submitted Bug Report.");
		await msg.author.send(embed)
			.catch(e => { });
	}

	private generateEmbed(author: User, question: string, response: string, directions: string): MessageEmbed {
		return MessageUtil.generateBlankEmbed(author)
			.setTitle(question)
			.setDescription(response.length === 0 ? "N/A" : response)
			.setFooter("Bug Report")
			.addField("General Instructions", `Please respond to the question posed above. Please see the specific directions below for this question. You will have up to 1500 characters, and will have 10 minutes to respond. Note that you cannot submit images.\n⇒ React with ✅ once you are satisfied with your response above. You will be moved to the next step.\n⇒ React with ❌ to cancel this process.\n\n⚠️ WARNING: Your Discord tag and ID will be shared with the developer.\nℹ️ NOTE: Once you submit your response to this question, you cannot view your response again!`)
			.addField("Specific Directions", directions);
	}
}