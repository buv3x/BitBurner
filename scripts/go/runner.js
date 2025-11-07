/** @param {NS} ns */
export async function main(ns) {
  const opponents = [
  "Netburners"
  , 
  // "Slum Snakes", 
  // "The Black Hand", 
  // "Tetrads", 
  // "Daedalus",
  "Illuminati"
  ];
  var counter = 0;
  ns.run("scripts/go/go2.js");
  await(ns.sleep(1000));
  while(true) {
    if(ns.go.getCurrentPlayer() == 'None') {
      ns.go.resetBoardState(opponents[counter % opponents.length], 13);
      ns.run("scripts/go/go2.js");
      counter++;
      ns.print(counter);
    }
    await(ns.sleep(1000));
  }



}