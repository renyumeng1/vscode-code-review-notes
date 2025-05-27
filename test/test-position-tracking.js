// Test file for intelligent comment position tracking
// This file is used to test the comment position tracking system

/**
 * Function to test basic comment positioning
 */
function basicFunction() {
    console.log("This is a basic function"); // Line that could have comments
    return "basic";
}

/**
 * Function to test position tracking when code is modified
 */
function complexFunction(param1, param2) {
    // This line will be used to test comment anchoring
    const result = param1 + param2;
    
    // More code that could be modified
    if (result > 0) {
        console.log("Positive result");
    }
    
    return result;
}

/**
 * Test data structure
 */
const testData = {
    users: ["Alice", "Bob", "Charlie"],
    settings: {
        theme: "dark",
        notifications: true
    }
};

/**
 * Async function for testing
 */
async function asyncTest() {
    // This line can have comments about async behavior
    const data = await fetch('/api/data');
    return data.json();
}

// Simple variable declaration
let globalVar = "test value";

console.log("Test file loaded successfully");
