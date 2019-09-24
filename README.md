# SDVXSHEET
SDVX simulator in javascript

Two main parts: a parser (that parses a KSH file), and a renderer (that actually renders the parsed data using D3.js and serves very basic "gameplay". Gameplay ticks are also completely off. Yes, I know WebGL would have been much better. I mostly used this as a quick way to practice specific sections of charts. 

Does not work with songs that have BPM changes. Also, newer KSH files appear to be out of sync with audio.

I forget the key bindings to actually play the game - I think it uses wrip for buttons, eo for fx, and mouse for lasers. I used joy2key to bind any controller you have to those keys for playing / practicing.

This was a pretty quick / hacky project, so please forgive the bad code. I'll help out if anybody wants to fix the huge amount of remaining bugs or use it for other purposes, but I'm no longer actively working on this. Please let me know if you do use it though, thanks!
