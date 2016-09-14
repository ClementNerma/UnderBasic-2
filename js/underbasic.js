"use strict";

/**
  * The UnderBasic library
  * @type {object}
  */
let UBL = {};

/**
  * UnderBasic interface
  * @type {UnderBasic}
  */
const UnderBasic = (new (function() {

  /**
    * Return an error object
    * @param {string} message
    * @param {object} [params]
    * @returns {object}
    */
  function error(message, params = {}) {
    return {
      failed: true,
      content: message.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, name) => params[name])
    };
  }

  /** The known types
    * @type {array} */
  const types = [ "number", "string", "list", "matrix", "yvar", "picture", "gdb" ];

  /** Their shorten name
    * @type {array} */
  const short_types = [ "num", "str", "list", "matrix", "yvar", "pic", "gdb" ];

  /** The extended types
    * @type {array} */
  const extended_types = [ "program", "appvar", "group", "application" ];

  /** Their short name
    * @type {array} */
  const short_extended_types = [ "prog", "appv", "group", "app" ];

  /**
    * Get the type of a variable from it's name
    * @param {string} name
    * @param {boolean} [extended] Allow extended types
    * @returns {string|void} type Nothing if the type is unknown
    */
  this.getVarType = (name, extended) =>
    name.match(/^[A-Z]$/) ? 'number' :
    name.match(/^Str[0-9]$/) ? 'string' :
    name.match(/^L[A-Z0-9]{1,6}$/) ? 'list' :
    name.match(/^\[[A-Z]\]$/) ? 'matrix' :
    name.match(/^Y[0-9]$/) ? 'yvar' :
    name.match(/^Pic[0-9]$/) ? 'picture' :
    name.match(/^GDB[0-9]$/) ? 'gdb' :
    // Extended types
    extended ?
    name.match(/^prgm[A-Z0-9]{1,8}$/) ? 'program' :
    name.match(/^appv[A-Z0-9]{1,8}$/) ? 'appvar' :
    name.match(/^group[A-Z0-9]{1,8}$/) ? 'group' :
    name.match(/^app[A-Z0-9]{1,8}$/) ? 'application' :
    null : null;

  /**
    * Get the type of a given content
    * @param {string} content
    * @param {boolean} [extended] Allow extended types
    * @param {object} [variables] Search through a set of variables
    * @returns {string|object} type Error object if the type is unknown
    */
  this.getType = (content, extended, variables = {}) => {
    // Type get using @getVarType
    let type = this.getVarType(content, extended);
    // If the type was detected...
    if(type)
      // Return it
      return type;

    // If that's a variable...
    if(variables.hasOwnProperty(content))
      // Return its type
      return variables[content];

    // Finally, consider this content as a plain one and search its type.

    // Number detected
    if(content.match(/^[0-9]+(\.[0-9]+|)$/))
      return 'number';

    // String detected
    if(content.match(/^"([^"]*)"$/))
      return 'string';

    // List detected
    if(content.match(/^{.*}$/)) {
      // Split the list into its items
      let list = content.split(',');
      // For each item...
      for(let item of list)
        // If that's not a number...
        if(this.getType(item, extended, variables) !== 'number')
          // Failed
          return error('All items in a list must be numbers');

      // That's a valid list
      return 'list';
    }

    // Matrix detected
    if(content.match(/^\[(.*)\]$/)) {
      // The parsed matrix
      let matrix = this.parseMatrix(content);

      // If an error occured during the parsing...
      if(!Array.isArray(matrix))
        return matrix;

      // That's a valid matrix
      return 'matrix';
    }
  };

  /**
    * Parse a plain matrix to an bi-dimensionnal array
    * @param {string} content
    * @param {object} [variables] The scope's variables
    * @returns {array|object} matrix Object is an error occured
    */
  this.parseMatrix = (content, variables) => {
    // If the opening bracket is missing...
    if(!content.startsWith('['))
      return error('Missing opening bracket for matrix');

    // If the closing bracket is missing...
    if(!content.endsWith(']'))
      return error('Missing closing bracket for matrix');

    // The parsed matrix
    let matrix = [];
    // Is there a row opened ?
    let inRow = false;
    // The item's buffer
    let buff = '';
    // The matrix's width
    let width = null;

    // For each char in the matrix... (excepted the opening and closing bracket)
    for(let char of content.substr(1, content.length - 2)) {
      // If that's a space...
      if(char === ' ')
        // Ignore it
        continue ;

      // Opening bracket
      if(char === '[') {
        // If we're already in a row...
        if(inRow)
          return error('Can\'t open a row into another');

        // Mark a new row
        inRow = true;
        // Add a new row to the matrix
        matrix.push([]);
      }

      // Closing bracket
      else if(char === ']') {
        // If we're not in a row...
        if(!inRow)
          return error('Can\'t close a row if no one is opened...');

        // If no number was specified here...
        if(!buff.length)
          return error('No number specified before the row\'s end');

        // If the buffer is not a number...
        if(!this.getType(buff, variables))
          return error('All matrix\'s items must be numbers');

        // Push the item to the collection
        matrix[matrix.length - 1].push(buff);

        // Mark the end of the row
        inRow = false;
        // Reset the buffer
        buff = '';

        // If the width was not set...
        if(!width)
          // Set it
          width = matrix[matrix.length - 1].length;
        else
          // If the row's width isn't the matrix's one...
          if(matrix[matrix.length - 1].length !== width)
            return error('All rows must have the same length (${width}) in the matrix', { width });
      }

      // If a row is closed...
      else if(!inRow)
        return error('Can\'t put any char between matrix\'s rows');

      // Separator symbol
      else if(char === ',') {
        // If no number was specified here...
        if(!buff.length)
          return error('No number specified before the separator');

        // If the buffer is not a number...
        if(!this.getType(buff, variables))
          return error('All matrix\'s items must be numbers');

        // Push the item to the collection
        matrix[matrix.length - 1].push(buff);
        // Reset the buffer
        buff = '';
      }

      // Any other symbol
      else
        // Append the char to the buffer
        buff += char;
    }

    // If a row was opened and not closd...
    if(inRow)
      return error('Missing closing bracket for the last row');

    return matrix;
  };

  /**
    * Compile a source code
    * @param {string} code
    * @returns {object}
    */
  this.compile = (code) => {
    /**
      * Format a content using built variables
      * @param {string} content
      * @returns {string} formatted
      */
    function format(content) {
      // The output string
      let out = '';
      // Characters passed since the beginning
      let passed = 0;
      // Split by space, ignoring spaces between quotes
      let parts = content.match(/\w+|"(?:\\"|[^"])+"/g);

      // For each part...
      for(let part of parts) {
        // If that's a part NOT between quotes
        if(!part.startsWith('"'))
          // Format it
          out += (passed ? content.charAt(passed - 1) : '')
              +  part.replace(/\b([a-zA-Z0-9_]+)\b/g, (match, word) => variables.hasOwnProperty(word) ? aliases[word] : word);

        passed += part.length + 1;
      }

      // Return the formatted string
      return out;
    }

    // Split code into lines
    let lines = code.split('\n');
    // Number of the line
    let row = 0;
    // Declared functions
    let functions = {};
    // Declared variables
    let variables = {};
    // Aliases (linked to variables)
    let aliases = {};
    // Used aliases (for variables)
    let used = { real: 0, str: 0, list: 0, matrix: 0, yvar: 0, pic: 0, gdb: 0 };
    // Output
    let output = [];
    // A temporary variable for storing regex matches
    let match;

    // For each line in the code...
    for(let line of lines) {
      // Increase the row...
      row ++;
      // Trim the line
      // Remove a potential ';' symbol at the end of the line
      line = line.trim().replace(/;+$/, '');
      // If the line is empty...
      if(!line.length)
        // Ignore it
        continue ;

      // If that's a variable declaration...
      if(match = line.match(/^([a-zA-Z]+) +([a-zA-Z0-9_]+)$/)) {
        // If this variable was already defined...
        if(variables.hasOwnProperty(match[2]))
          return error('Variable "${name}" is already defined', { name: match[2] });

        // If that's a function's name...
        if(functions.hasOwnProperty(match[2]))
          return error('Name "${name}" is already used for a function', { name: match[2] });

        // Get the type as lower-cased (case insensitive)
        let type = match[1].toLowerCase();

        // If that's a shorten type...
        if(short_types.includes(type))
          // Make it the real one
          type = types[short_types.indexOf(type)];
        else
          // If that's not a known type...
          if(!types.includes(type))
            return error('Unknown type "${type}"', { type });

        // Set the variable
        variables[match[2]] = type;

        // Allocate a new alias for it, depending of its type
        // Here the 'var' keyword is used because the 'let' one makes the
        // 'alias' variable unaccessible from the 'switch' block.
        var alias;
        // Error message when no alias can be used
        let msg = 'The maximum number of aliases for type "${type}" has been reached (${max})';
        // The TI alphabet (used for aliases)
        let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        // Depending on the type...
        switch(type) {
          case 'number':
            // If all numbers were used...
            if(used.real === 26)
              return error(msg, {type, max: 26});

            // Increase the number of used aliases
            used.real ++;
            // Allocate the new one
            alias = alphabet.charAt(used.real - 1);
            break;

          case 'string':
            if(used.str === 10)
              return error(msg, {type, max: 10});

            used.str ++;
            alias = (used.str - 1).toString(); // 0, 1, 2, 3...
            break;

          case 'list':
            if(used.list === 6)
              return error(msg, {type, max: 6});

            used.list ++;
            alias = 'L' + used.list.toString(); // L1, L2...
            break;

          case 'matrix':
            if(used.matrix === 26)
              return error(msg, {type, max: 10});

            used.matrix ++;
            alias = '[' + alphabet.charAt(used.matrix - 1) + ']';
            break;

          case 'yvar':
            if(used.yvar === 10)
              return error(msg, {type, max: 10});

            used.yvar ++;
            alias = 'Y' + (used.yvar - 1).toString(); // 0, 1, 2, 3...
            break;

          case 'picture':
            if(used.pic === 10)
              return error(msg, {type, max: 10});

            used.pic ++;
            alias = 'Pic' + (used.pic - 1).toString(); // 0, 1, 2, 3...
            break;

          case 'gdb':
            if(used.gdb === 10)
              return error(msg, {type, max: 10});

            used.gdb ++;
            alias = 'GDB' + (used.gdb - 1).toString(); // 0, 1, 2, 3...
            break;
        }

        // Allocate the new alias
        aliases[match[2]] = alias;
      }
      // If that's an assignment...
      else if(match = line.match(/^([a-zA-Z0-9_]+) *= *(.*)$/)) {
        // If the assigned variable is not defined...
        if(!variables.hasOwnProperty(match[1]))
          return error('Variable "${name}" is not defined', { name: match[1] });

        // The variable's type
        let type = this.getType(match[2]);

        // If this type is not known...
        if(!type)
          return error('Unknown type given');

        // If that's not the same type as the variable...
        if(type !== variables[match[1]])
          return error('Type mismatch : attempting to assign content type "${type}" in a variable of type "${type2}"', { type, type2: variables[match[1]] });

        // Output
        output.push(match[2] + '->' + format(match[1]));
      }
      // If the syntax is not valid...
      else
        // Syntax error
        return error('Syntax error');
    }

    // Success !
    return {
      content: output.join('\n'), // Join the lines
      // Build trash
      vars: variables,
      func: functions,
      aliases
    };
  };

  // Export data into the library
  UBL = {
    types, short_types, extended_types, short_extended_types,
    allTypes: types.concat(short_types).concat(extended_types).concat(short_extended_types)
  };

})());
