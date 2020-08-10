var collections = require('dsjslib');

var myMap = {};

function test(keyIn, keyAdd) {
    var valueIn = myMap[keyIn];
    var valueAdd = myMap[keyAdd];

    if (valueIn > valueAdd) {
        return -1;
    } else if (valueIn == valueAdd) {
        return 0;
    } else {
        return 1;
    }
}

var myTree = new collections.AVLTree(test);

for (var i = 0; i < 10; i++) {
    var randVal = Math.random();
    myMap[randVal] = i;
    myTree.put(randVal, i);
}

console.log(myTree.min());
console.log(myTree.max());