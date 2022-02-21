class Node {
    constructor(nodeKey, nodeValue) {
        this.nodeKey = nodeKey;
        this.nodeValue = nodeValue;
        this.prevNode = null;
        this.nextNode = null;
    }
}


export default class Queue {
    constructor() {
        this.internalMap = new Map();
        this.frontNode = null;
        this.backNode = null;
    }

    getJSON() {
        return Array.from(this.internalMap.keys());
    }

    nodeExists(nodeKey) {
        if (this.internalMap.get(nodeKey) === undefined) {
            return false;
        } else {
            return true;
        }
    }

    getNode(nodeKey) {
        console.assert(this.internalMap.get(nodeKey) !== undefined, "Node for getting is undefined");
        return this.internalMap.get(nodeKey);
    }

    removeNode(nodeKey) {
        var rmNode = this.internalMap.get(nodeKey);
        if (rmNode === undefined) {
            console.log("Node for removal is undefined");
            return;
        }

        // Case where rmNode is the one and only node in the queue
        if (rmNode === this.frontNode && rmNode === this.backNode) {
            this.frontNode = null;
            this.backNode = null;

            this.internalMap.delete(nodeKey);

            // Case where rmNode is at the front of the queue, and at least one node is behind it
        } else if (rmNode === this.frontNode) {
            var rightNode = rmNode.nextNode;
            rightNode.prevNode = null;

            this.frontNode = rightNode;
            this.internalMap.delete(nodeKey);

            // Case where rmNode is at the back of the queue, and at least one node is in front of it
        } else if (rmNode === this.backNode) {
            var leftNode = rmNode.prevNode;
            leftNode.nextNode = null;

            this.backNode = leftNode;
            this.internalMap.delete(nodeKey);

            // Case where rmNode is in the middle of the queue
        } else {
            var leftNode = rmNode.prevNode;
            var rightNode = rmNode.nextNode;

            // Removing assignments to rmNode
            leftNode.nextNode = rightNode;
            rightNode.prevNode = leftNode;

            this.internalMap.delete(nodeKey);
        }
    }

    // Adds node to back of queue
    addNode(nodeKey, nodeValue) {
        // Handle base case of no nodes in queue/map
        if (this.frontNode === null && this.backNode === null) {
            var newNode = new Node(nodeKey, nodeValue);
            this.frontNode = newNode;
            this.backNode = newNode;
            // Add node to map
            this.internalMap.set(nodeKey, newNode);
            return;
        }

        var curBackNode = this.backNode;
        var newNode = new Node(nodeKey, nodeValue);

        // Handle assignments of previous and back node properly
        newNode.prevNode = curBackNode;
        newNode.nextNode = null;
        curBackNode.nextNode = newNode;
        this.backNode = newNode;

        // Add node to map
        this.internalMap.set(nodeKey, newNode);
    }
}