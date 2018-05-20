var ssbKeys = require('ssb-keys')
var ssbClient = require('ssb-client')
var ssbConfig = require('ssb-config/inject')('ssb', {port: 8008})
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const twitterConfig = require('./config');
var prompt = require('prompt-sync')();

ssbConfig.keys = ssbKeys.loadOrCreateSync(path.join(ssbConfig.path, 'secret'))

var id = ssbConfig.keys.id
ssbConfig.remote = `net:127.0.0.1:${ssbConfig.port}~shs:${id.slice(1).replace('.ed25519', '')}`

console.log("Publishing to ID", id)

var dataDir = "data";

ssbClient(
  // ssbConfig.keys,                // optional, defaults to ~/.ssb/secret
  {
    host: '127.0.0.1', // optional, defaults to localhost
    port: ssbConfig.port,        // optional, defaults to 8008
    key: id,      // optional, defaults to keys.id
  },
  function (err, sbot, config) {
    if (err) throw(err)
    
    // Loop through all the files in the data directory
    fs.readdir( dataDir, function( err, files ) {
            if( err ) {
                console.error( "Could not list the directory.", err );
                process.exit( 1 );
            } 
            
            var filesToBeAdded = orderDates(files, twitterConfig.from, twitterConfig.to);

            console.log("Include retweets:", twitterConfig.retweets);
            var tweetsToBeAdded = getTweetsToAdd(filesToBeAdded);
            console.log(tweetsToBeAdded);
            
            var tweets = previewTweets(tweetsToBeAdded);
            if(!twitterConfig.dry_run){
                console.log("Publishing tweets to ssb...");
                index = Object.keys(tweets)[Object.keys(tweets).length-1];
                while (index > -1){
                    if (tweets[index]) {
                        sbot.publish({type: "post", text: tweets[index]['text']}, function (err, msg) {
                            if (err) throw err
                            console.log("Published: ", msg)
                        })
                    }
                    index -= 1;
                }
            } else {
                console.log("Finished preview. To add tweets to ssb, change 'dry_run' field in config.js to 'false'.")
            }
            
            sbot.close()
    })
})


function isRetweet(tweet){
    if(tweet['retweeted_status']){
        return true;
    }
    return false;
}

function isMyTweet(tweet){
    var bool = false;
    if(!tweet['retweeted_status'] && tweet['in_reply_to_screen_name'] == twitterConfig.screen_name){
        if (tweet['text'].slice(0, 1) != '@') {
            bool = true;
        }
    } else if (!tweet['retweeted_status'] && !tweet['in_reply_to_screen_name']){
        bool = true;
    }
    return bool;
}

function orderDates(files, from, to){
    filesToBeAdded = []
    for (i in files){
        var file = files[i];
        var fileDate = file.slice(0, -3).split('_');
        var fromCutoff = parseInt(from[0]) + parseInt(from[1]);
        var toCutoff = parseInt(to[0]) + parseInt(to[1]);
        var fileDate = parseInt(fileDate[0]) + parseInt(fileDate[1]);
        if (fromCutoff <= fileDate && fileDate <= toCutoff) {
            filesToBeAdded.push(file);
        }
    }
    console.log(filesToBeAdded);
    return filesToBeAdded;
}

function parseTweets(filePath){
    var data = fs.readFileSync(filePath, 'utf8');
    var jsonData = data.split('\n').slice(1).join('\n');
    var tweetJSON = JSON.parse(jsonData);
    return tweetJSON
}

function getTweetsToAdd(files){
    var tweetsToBeAdded = {};
    files.forEach( function( file, index ) {
            // parse each tweet file
            var filePath = path.join( dataDir, file );
            var tweetJSON = parseTweets(filePath);
            var counter = 0;
            for (var t in tweetJSON){
                var tweet = tweetJSON[t];
                var tweetStr = "[From Twitter](" + "https://twitter.com/" + twitterConfig.screen_name + "/status/" + tweet['id_str'] + "): " + tweet['text'];
                //  Cases: retweets, own tweets, own replies
                if(twitterConfig.retweets){
                    //  include retweets
                    if (isRetweet(tweet)) {
                        var tweet = {};
                        tweet['type'] = "retweet";
                        tweet['text'] = tweetStr;
                        tweetsToBeAdded[counter] = tweet;
                        counter += 1;
                    }
                }
                // Include my own tweets, regardless of config 
                if (isMyTweet(tweet)){
                    var tweet = {};
                    tweet['type'] = "my tweet";
                    tweet['text'] = tweetStr;
                    tweetsToBeAdded[counter] = tweet;
                    counter += 1;
                }
            }
        })
    return tweetsToBeAdded
}

function previewTweets(tweets){
    var discard = prompt("To confirm, respond 'y'. To NOT add any of the tweets above, enter their numerical IDs, separated by commas => ");
    console.log(discard);
    if (discard == 'y') {
        return tweets
    } 
    var strs = discard.split(',');
    var discarded = [];
    for (d in strs) {
        discarded.push(parseInt(strs[d]));
    }
    console.log("Discarded", discarded);
    for (var key in tweets) {
        if (discarded.includes(parseInt(key))){
            delete tweets[key];
        }
    }
    console.log("Tweets to be added after edits:", tweets);
    var confirm = prompt("To add the tweets above, respond 'y'. To remove more tweets, respond 'n'. To cancel, respond 'c'. => ")
    if (confirm == 'y'){
        return tweets
    } else if (confirm == 'n') {
        previewTweets(tweets);
    } else {
        process.exit( 1 );
    }
}
