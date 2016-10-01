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
    * @param {object|number} [params] Parameters or column number
    * @param {number} [column]
    * @returns {object}
    */
  function _error(message, params = {}, column = 0) {
    // If the parameters argument is a number...
    if(typeof params === 'number') {
      // Set it as the column
      column = params;
      // And clean the parameters
      params = {};
    }

    // Return the error
    return {
      column : column,
      message: message,
      failed : true,
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

  /** The types that doesn't support any operation (static types)
    * @type {array} */
  const staticTypes = [ "picture", "gdb", "program", "appvar", "group", "application" ];

  /** The combinations
    * @type {array} */
  const combinations = [ "and", "or", "xor" ];

  /** The errors width
    * @type {number} */
  let errorWidth = 20;

  // The last parsed content (used to avoid infinite loops)
  let last_parsed;

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
    * @param {boolean} [dontParse] Do not parse the expression to increase the speed
    * @returns {string|object} type Error object if the type is unknown
    */
  this.getType = (content, extended, variables = {}, dontParse = false) => {
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
    let match;
    if(match = content.match(/^{(.*)}$/)) {
      // Split the list into its items
      let list = match[1].split(',');
      // For each item...
      for(let i = 0; i < list.length; i++) {
        // If that's not a number...
        if(this.getType(list[i], extended, variables) !== 'number')
          // Failed
          return _error('All items in a list must be numbers', list.slice(0, i).length);
      }

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

    // If asked to not parse...
    if(dontParse)
      // Failed !
      return _error('Unknown content type');

    // If the current content is the last parsed one...
    if(last_parsed === content) {
      // Reset it
      last_parsed = '';
      // Failed
      return _error('Unknown content type [inf loop]');
    }

    // Set he last parsed content (used to avoid infinite loops)
    last_parsed = content;
    // The parsed expression
    let parsed = this.parse(content, extended, variables);
    // If that code is runned, that's not an infinite loop
    last_parsed = null;
    // If an error occured while parsing...
    if(parsed.failed)
      return parsed;
    // If a type was dected...
    return parsed.type;
  };

  /**
    * Check if a content matches with a specific type (NOTE: Extended mode is forced)
    * @param {string} content
    * @param {string} parent
    * @param {object} [variables] variables OR parsed expression
    * @param {object} [expr] The parsed expression
    * @returns {boolean} working
    */
  this.match = (content, parent, variables, expr) => {
    // If the expected type is 'unref' (optionnal or not)...
    if(parent === 'unref' || parent === '[unref]')
      // Success !
      return true;

    // Case of an optionnal content...
    if(parent.startsWith('[') && parent.endsWith(']')) {
      // If no content was provided...
      if(!content)
        // Success !
        return true;

      // ELse, make it a normal type
      parent = parent.substr(1, parent.length - 2);
    }

    // Get type, throught the variables or considering it's a variable name
    let type = variables && variables.hasOwnProperty(content) ? variables[content] : this.getVarType(content, true);
    // If a type was found...
    if(type) // We know that the content is a pointer
      return (parent.endsWith('*') ?
              type === parent.substr(0, parent.length - 1) :
              (parent.endsWith('~') ? false : type === parent))
              || parent === 'mixed*' || parent === 'mixed';

    // Now we know that's not a pointer, so, if the expected type is a pointer...
    if(parent.endsWith('*'))
      // Return false
      return false;

    // We can also remove the '~' symbol (if it was specified)
    if(parent.endsWith('~'))
      parent = parent.substr(0, parent.length - 1);

    // Get the type
    type = this.getType(content, true, variables, true);

    // If a type was found...
    if(typeof type === 'string')
      // Check if it matches
      return type === parent || parent === 'mixed';

    // If the given variables is an expression object...
    if(expr)
      // Check the type
      return !expr.failed && (expr.type === parent || parent === 'mixed');

    // Parse the content
    let parse = this.parse(content);
    // If an error occured...
    if(parse.failed)
      // Failed !
      return false;

    // Here we have a successfully parsed content, we check its type...
    return (parse.type === parent || parent === 'mixed');
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
      return _error('Missing opening bracket for matrix');

    // If the closing bracket is missing...
    if(!content.endsWith(']'))
      return _error('Missing closing bracket for matrix', content.length - 1);

    // The parsed matrix
    let matrix = [];
    // Is there a row opened ?
    let inRow = false;
    // The item's buffer
    let buff = '';
    // The matrix's width
    let width = null;
    // The current column
    let col = 0;

    // For each char in the matrix... (excepted the opening and closing bracket)
    for(let char of content.substr(1, content.length - 2)) {
      // Increase the column
      col ++;

      // If that's a space...
      if(char === ' ' || char === String.fromCharCode(160)) {
        // Append it to the buffer (needed for errors position)
        buff += ' ';
        // Ignore it
        continue ;
      }

      // Opening bracket
      if(char === '[') {
        // If we're already in a row...
        if(inRow)
          return _error('Can\'t open a row into another', col);

        // Mark a new row
        inRow = true;
        // Add a new row to the matrix
        matrix.push([]);
      }

      // Closing bracket
      else if(char === ']') {
        // If we're not in a row...
        if(!inRow)
          return _error('Can\'t close a row if no one is opened...', col);

        // If no number was specified here...
        if(!buff.length)
          return _error('No number specified before the row\'s end', col);

        // If the buffer is not a number...
        if(typeof this.getType(buff.trim(), variables) === 'object')
          return _error('All matrix\'s items must be numbers', col - buff.replace(/^ +/, '').length);

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
            return _error('All rows must have the same length (${width}) in the matrix', { width }, col);
      }

      // If a row is closed...
      else if(!inRow)
        return _error('Can\'t put any char between matrix\'s rows', col);

      // Separator symbol
      else if(char === ',') {
        // If no number was specified here...
        if(!buff.length)
          return _error('No number specified before the separator', col);

        // If the buffer is not a number...
        if(typeof this.getType(buff, variables) === 'object')
          return _error('All matrix\'s items must be numbers', col - buff.length);

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
      return _error('Missing closing bracket for the last row', col + 1);

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
      let parts = content.match(/[^"]+|"(?:\\"|[^"])+"/g);

      // For each part...
      for(let part of parts) {
        // If that's a part NOT between quotes
        if(!part.startsWith('"'))
          // Format it
          out += part.replace(/\b([a-zA-Z0-9_]+)\b/g, (match, word) => variables.hasOwnProperty(word) ? aliases[word] || word : word);
        else
          out += part;

        passed += part.length + 1;
      }

      // Return the formatted string
      return out;
    }

    /**
      * Remove all spaces outside quotes
      * @param {string} str
      * @param {boolean} [allowCombinations] ALlow combinations
      * @returns {string} str
      */
    function rmspace(str, allowCombinations = false) {
      if(!allowCombinations)
        return str.replace(/([^"]+)|("[^"]+")/g, ($0, $1, $2) => $1 ? $1.replace(/ /g, '') : $2);

      return str.replace(/([^"]+)|("[^"]+")/g, ($0, $1, $2) => {
        if(!$1)
          return $2

        if(combinations.includes($1.trim()))
          return $1;

        return $1
          .replace(/"[^"]+" +(and|or|xor) +"[^"]+"/g, $0 => $0.replace(/ /g, String.fromCharCode(160))) // Backup all spaces by turning them into non-breaking spaces
          .replace(/"[^"]+" +(and|or|xor) +([a-zA-Z0-9_])/g, $0 => $0.replace(/ /g, String.fromCharCode(160))) // Backup all spaces by turning them into non-breaking spaces
          .replace(/([a-zA-Z0-9]+) +(and|or|xor) +"[^"]+"/g, $0 => $0.replace(/ /g, String.fromCharCode(160))) // Backup all spaces by turning them into non-breaking spaces
          .replace(/[a-zA-Z0-9]+ +(and|or|xor) +[a-zA-Z0-9_]/g, $0 => $0.replace(/ /g, String.fromCharCode(160))) // Backup all spaces by turning them into non-breaking spaces
          .replace(/ /g, '') // Remove all (other) spaces
          .replace(new RegExp(String.fromCharCode(160), 'g'), ' ') // Restore all spaces
      });
    }

    /**
      * Return an error object
      * @param {string} message
      * @param {object|number} [params] Parameters or column number
      * @param {number} [column]
      * @returns {object}
      */
    function error(message, params, column) {
      return formatError(_error(message, params, column));
    }

    /**
      * Format an error object to be compatible with compiler's context
      * @param {object} error
      * @param {number} [inc_col] Increase the column index
      * @returns {object} error
      */
    function formatError(obj, inc_col = 0) {
      // Increase the column index
      obj.column += inc_col;

      // === Set the message with debugging ===
      // Define the part to display
      let part = line.substr(obj.column < errorWidth ? 0 : obj.column - errorWidth, 2 * errorWidth + 1);
      // Define the cursor's position
      // The Math.max() function is used here to prevent negative values if the
      // parser calculates a wrong cursor position.
      let cursor = Math.max(obj.column < errorWidth ? obj.column : errorWidth, 0);
      // Set the new message
      obj.content = `ERROR : At column ${obj.column + 1} : \n\n${part}\n${' '.repeat(cursor)}^\n${' '.repeat(cursor)}${obj.content}`;

      // Return the final error object
      return obj;
    }

    // Split code into lines
    let lines = code.split('\n');
    // Number of the line
    let row = 0;
    // Declared functions
    let functions = {};
    // Declared variables
    let variables = { theta: 'number', e: 'number', pi: 'number', n: 'number', i: 'number', answer: 'mixed' };
    // Aliases (linked to variables)
    let aliases = { theta: 'theta' };
    // Used aliases (for variables)
    let used = { real: 0, str: 0, list: 0, matrix: 0, yvar: 0, pic: 0, gdb: 0 };
    // Output
    let output = [];
    // The current line's content (must be global to be read by formatError)
    let line;
    // A temporary variable for storing regex matches
    let match;

    // For each line in the code...
    for(line of lines) {
      // Increase the row...
      row ++;
      // Trim the line
      // Remove a potential ';' symbol at the end of the line
      line = line.trim().replace(/;+$/, '');
      // Remove commentaries
      line = line
              .replace(/\/\/(.*)$/, '')
              .replace(/#(.*)$/, '')
      // If the line is empty...
      if(!line.length)
        // Ignore it
        continue ;

      // If that's a variable declaration...
      if(((match = line.match(/^([a-zA-Z]+)( +)([a-zA-Z0-9_]+)( *= *.+|)$/))
       || (match = line.match(/^()()([a-zA-Z0-9_]+)( *= *.+|)$/)))
       && (match ? !UBL.functions.hasOwnProperty(match[1]) : false)) {
        // Get the type as lower-cased (case insensitive)
        let type = match[1].toLowerCase();

        // The shift of the content to assign and it's "=" symbol (including spaces)
        let shift = match[4].length;
        // The content to assign (if asked)
        let assign = match[4].trim().replace(/^= */, '');
        shift -= assign.length;
        // The type of the assigned content
        let a_type;
        // If it's no null...
        if(assign) {
          // Parse it
          let parsed = this.parse(assign, false, variables);
          // If an error occured...
          if(parsed.failed)
            return formatError(parsed, match[1].length + match[2].length + match[3].length + shift);
          // Set it's type
          a_type = parsed.type;
        }

        // If the variable is declared implicitly...
        if(type === 'var' || type === 'let' || type === 'declare' || type === 'local' || !type) {
          // If there no assign content was specified...
          if(!assign)
            return error('Implicit declarations needs a default content');

          // Set the type of the variable
          type = a_type;
        }

        // If that's a shorten type...
        if(short_types.includes(type))
          // Make it the real one
          type = types[short_types.indexOf(type)];
        else
          // If that's not a known type...
          if(!types.includes(type))
            return error('Unknown type "${type}"', { type: match[1] });

        // If this variable was already defined...
        if(variables.hasOwnProperty(match[3]))
          return error('Variable "${name}" is already defined', { name: match[3] }, match[1].length + match[2].length);

        // If that's a function's name...
        if(functions.hasOwnProperty(match[3]))
          return error('Name "${name}" is already used for a function', { name: match[3] }, match[1].length + match[2].length);

        // If that's a native function name...
        if(UBL.functions.hasOwnProperty(match[3]))
          return error('Name "${name}" is already used for a native function', { name: match[3] }, match[1].length + match[2].length);

        // If this name is already used...
        if(this.getType(match[3]))
          return error('Name "${name}" is a reserved name', { name: match[3] }, match[1].length + match[2].length);

        // If a content is assigned and the type does not match...
        if(a_type && type !== a_type)
          return error('Type mismatch : Attempting to assign a ' + a_type + ' to a ' + type + ' variable', match[1].length + match[2].length + match[3].length + shift);

        // Set the variable
        variables[match[3]] = type;

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
            alias = 'Str' + (used.str - 1).toString(); // 0, 1, 2, 3...
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
        aliases[match[3]] = alias;
      }
      // If that's an assignment...
      else if(match = line.match(/^([a-zA-Z0-9_]+)( *)(\+|\-|\*|\/|)( *)=( *)(.*)$/)) {
        // If the assigned variable is not defined...
        if(!variables.hasOwnProperty(match[1]))
          return error('Variable "${name}" is not defined', { name: match[1] });

        // The content's position in the string
        let pos = match[1].length + match[2].length + match[3].length + match[4].length + match[5].length + 1;
        // The variable's type
        let type = this.getType(match[6], null, variables);

        // If this type is not known...
        if(typeof type === 'object')
          return formatError(type, pos);

        // If that's not the same type as the variable...
        if(type !== variables[match[1]])
          return error('Type mismatch : attempting to assign content type "${type}" in a variable of type "${type2}"', { type, type2: variables[match[1]] }, pos);

        // If the operator is '+' and is not supported...
        if(match[3] === '+' && !(['number', 'string']).includes(type))
          return error('Operator "${op}" is not supported by type "${type}"', { op: '+', type });

        // If the operator is '-' and is not supported...
        if(match[3] === '-' && type !== 'number')
          return error('Operator "${op}" is not supported by type "${type}"', { op: '-', type });

        // If the operator is '+' and is not supported...
        if(match[3] === '*' && type !== 'number')
          return error('Operator "${op}" is not supported by type "${type}"', { op: '*', type });

        // If the operator is '+' and is not supported...
        if(match[3] === '/' && type !== 'number')
          return error('Operator "${op}" is not supported by type "${type}"', { op: '/', type });

        // If there is an operator...
        if(match[3])
          // Change the content
          match[6] = aliases[match[1]] + match[3] + (match[6].match(/\+|\-|\*|\//) && match[3] !== '+' ? '(' + match[6] + ')' : match[6]);
          /* looking for an operator, if there is one content must be between parenthesis. The '+' operator doesn't need a parenthesis */

        // Output
        output.push(format(rmspace(match[6], true)) + '->' + aliases[match[1]]);
      }
      // Here we know that's a plain expression
      // Its result will be stored by the interpreter to the "Ans" variable
      else {
        // If this is a function called without parenthesis...
        if(match = line.match(/^([a-zA-Z][a-zA-Z0-9_]+)( +)([^\+\-\*\/\(].*)$/))
          // Change the line's syntax to add parenthesis
          line = match[1] + match[2] + '(' + match[3] + ')';

        // The result of the line's parsing
        let result = this.parse(line, null, variables, false);
        // If an error occured during the parsing...
        if(result.failed)
          return formatError(result);
        // Output
        // If that's NOT an instruction...
        if(!result.instruction)
          output.push(format(rmspace(line, true)));
        else // If that IS an instruction...
          output.push(format(rmspace(line, true).replace(/^([a-zA-Z0-9_]+)\((.*)\)$/, '$1 $2')))
      }
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

  /**
    * Parse an expression
    * @param {string} expr
    * @param {boolean} [extended]
    * @param {object} [variables]
    * @returns {object} parsed
    */
  this.parse = (expr, extended = false, variables = {}, voidAsInstruction = true, global_type, fullExpr, startI) => {
    // This function is derived from the Expression.js library which doesn't
    // have a code documentation.

    function _e(msg, add = 0) {
      return _error(msg, i + (startI - 2 || -1) + 1 + add);
    }

    // Integer buffer
    let buffInt = '';
    // Decimal buffer
    let buffDec = '';
    // Is it a floating value ?
    let floating = false;
    // Current operator
    let operator = '';
    // Letters buffer, used for variables and functions name
    let buffLetter = '';
    // String buffer, used for quoted values, e.g. "Hello World"
    let buffString = '';
    // List of the numbers found in the expression
    let numbers = [];
    // ???
    let $ = -1;
    // ???
    let get;
    // Parts of the expression that follow somes special operation rules
    let parts = [];
    // Current character in the expression
    let char;
    // The current column in the expression
    let i = 0;
    // The number of parenthesis opened
    let p_count = 0;
    // The content between the two parenthesis (sub-expression or function arguments)
    let p_buff = '';
    // The name of the function that is currently called
    let functionCall = [];
    // The arguments of the currently called function
    let callfunc = [];
    // ???
    let functionIndex = [];
    // Arguments given to the called function
    let callBuffs = [];
    // The current function in the array
    let func = 0;
    // ???
    let j;
    // Is there a string opened ?
    let stringOpened = false;
    // The column where the function was called
    let functionColumn = [];
    // The static type of the expression
    let staticType;
    // Ignore the next comma (used for embricked functions call)
    let ignoreNextComma = false;
    // The referers used for arguments types checking
    let referers = [];
    // The global expression's type
    let g_type = global_type || null;
    // Is the expression an instruction call ?
    let isInstruction = false;
    // The combination operator
    let combination = '';
    // The number on the left of the operator
    let leftCombination = '';

    // Add a '+' because the last part of the expression must be parsed too
    expr += '+';

    // For each char in the expression...
    for(char of expr) {
      // Increase the column number
      i++;

      // '(' symbol
      if(char === '(') {
        // If that's just a simple parenthesis opening
        if(p_count && !buffLetter) {
          p_count += 1;
          p_buff  += '(';
          continue ;
        }

        let a = buffInt, b = buffDec, c = buffString, d = buffLetter;

        // If the current value is a number...
        if(buffInt || buffDec)
          return _e('Opening parenthesis just after a number');

        // If the current value is a string...
        if(buffString)
          return _e('Opening parenthesis just after a string');

        // If the current value is a name...
        // That should be a function
        if(buffLetter) {
          // If the function doesn't exist
          if(!UBL.functions.hasOwnProperty(buffLetter))
            return _e('Unknown function "' + buffLetter + '"', -buffLetter.length - 1);

          // If the function is 'void'-typed
          if(UBL.functions[buffLetter][0] === 'void' || UBL.functions[buffLetter][0] === 'inst') {
            // If the 'void' type is forbidden...
            if(voidAsInstruction)
              return _e('That\'s a static instruction, can\'t be used here');

            // If there were already some operations...
            if(numbers.length)
              return _e('Type mismatch : Can\'t use the "void" type here', -buffLetter.length - 1);

            // Set the global type as 'void'
            g_type = 'void';
          }

          // Set the called function name
          functionCall.push(buffLetter);
          // Set the column where the function was called
          functionColumn.push(i);
          // Set the needed arguments of the function
          callfunc.push(UBL.functions[buffLetter].slice(1));
          // ???
          functionIndex.push(p_count + 1);

          // If there is another function call after this one...
          if(functionCall.length > 1) {
            // Add an argument referer to it
            callBuffs.last().push('$' + buffLetter);
            // Reserve this referer
            referers.push(buffLetter);
          }

          // Set the arguments
          callBuffs.push([]);
          // Reset the buffer
          p_buff = '';
        }

        buffLetter = d;

        if(!p_count)
          p_buff = '';

        p_count += 1;

        if(p_count === 1)
          continue ;
      } else
      // That should be the end of a sub-expression or a function call
      if(char === ')') {
        // If that was a function call...
        if(functionCall.length && p_count === functionIndex.last()) {
          if(p_buff) // Fix a bug when script calls a function without any argument
            callBuffs.last().push(p_buff);

          // Defined a column for debugging
          let col = functionColumn.last();
          // The argument's number
          let index = 0;

          // If there are too many arguments...
          if(callBuffs.last().length > callfunc.last().length)
            return _e('Too many arguments : function ' + functionCall.last() + ' requires only ' + callfunc.last().length + ' arguments, ' + callBuffs.last().length + ' given');

          // If some arguments are missing and the missing ones are not
          // optionnals...
          if(callBuffs.last().length < callfunc.last().length && !callfunc.last()[callBuffs.last().length].startsWith('['))
            return _e('Missing ' + (callfunc.last().length - callBuffs.last().length) + ' arguments', -1 /* strangely the -1 is needed here... bug ? */);

          if(callBuffs.length && callBuffs.last()[0] && callBuffs.last()[0].startsWith('('))
            callBuffs.last()[0] = callBuffs.last()[0].substr(1);

          // For each argument given...
          for(let buff of callBuffs.last()) {
            // If this argument is a referer...
            if(buff.startsWith('$') && referers.includes(buff.substr(1))) {
              // Remove the buffer's first symbol
              buff = buff.substr(1);
              // Remove the referer
              referers.splice(referers.indexOf(buff), 1);
              // Set the type from the function's one
              get = { failed: false /* not needed but specified for a better readibility */,
                      type: UBL.functions[buff][0] };
            } else { // Else, that's a normal argument
              get = this.parse(buff.trim(), extended, variables, voidAsInstruction, undefined, undefined, expr, col);

              // If failed to parse the content
              if(get.failed)
                return get;
            }

            index ++;

            // If that's not the type we expect for...
            if(!this.match(buff.trim(), callfunc.last()[index - 1], variables, get))
              return _e('Argument ' + index + ' must be a ' + callfunc.last()[index - 1].replace(/^\[(.*)\]$/, '$1') + ', ' + get.type + ' given', col - i + (buff.match(/^ +/) || [''])[0].length);

            col += buff.length + 1;
          }

          // Add a new part
          parts.push({ function: functionCall.last(), arguments: callBuffs.last() });

          // If there is still a function call...
          if(functionCall.length > 1)
            ignoreNextComma = true;
          else { // Else...
            // If the function returned a static type...
            if(staticTypes.includes(UBL.functions[functionCall[0]][0]))
              staticType = UBL.functions[functionCall[0]][0];
          }

          // Remove the function call
          functionCall.pop();
          functionIndex.pop();
          functionColumn.pop();
          callBuffs.pop();
          callfunc.pop();

          // Reset variables
          buffInt = '$' + (++$);
          buffLetter = '';
          floating = false;
          // Indicates that a parenthesis was close
          p_count -= 1;
          p_buff = '';
          // Ignore the next instructions
          continue ;
        }

        // Here, we know that wasn't a function call
        // If no parenthesis was opened...
        if(!p_count)
          return _e('No parenthesis is opened');

        // Indicates that the parenthesis was closed
        p_count -= 1;

        // If there is no more parenthesis...
        if(!p_count) {
          // If there was a value specified between the parenthesis...
          if(p_buff) {
            // Parse it !
            get = this.parse(p_buff, extended, variables, voidAsInstruction, g_type, expr, i - p_buff.length);

            // If the parse failed...
            if(get.failed)
              // Return the error
              return get;

            // If there is only one number, don't consider it as a sub-expression
            // but as a single value, that permit to reduce the final object's
            // size and the evaluation speed.
            if(get.numbers.length === 1 && !get.numbers[0].startsWith('$'))
              // Optimization
              buffInt = get.numbers[0];
            else {
              // Indicates that this number is a part of an expression
              buffInt = '$' + (++$);
              // Add the sub-expression
              parts.push(!get.parts.length ? get.numbers : get);
            }

            // Ignore the next instructions
            continue ;
          } else
            // If no content was specified between the parenthesis...
            return _e('No content between parenthesis', -2);
        }
      } else
      // If this is a function call and the current character is ','
      // that corresponds to the arguments separator
      if(functionCall.length && char === ',') {
        // If the next comma needs to be ignored...
        if(ignoreNextComma)
          continue ;

        // If there is already the same number of arguments in the call and in
        // the function's declaration... (in fact we're checking for the right
        // number of arguments LESS 1, because there is still one argument
        // after the ',' separator)
        if(callBuffs.last().length === callfunc.last().length - 1)
          return _e('Too many arguments, function "' + functionCall.last() + '" needs only ' + callfunc.length + ' arguments', -1);

        // Add the argument to the list
        callBuffs.last().push(p_buff);
        // Reset the argument buffer
        p_buff = '';
        // Ignore the nex instructions
        continue ;
      }

      // If there is still parenthesis
      if(p_count) {
        // Add the char to the buffer
        p_buff += char;
        // Ignore the next instructions
        continue ;
      }

      // If the current char is '"'
      // AND if the current value is a string...
      if(char === '"' && stringOpened) {
        // Then that's the closing string symbol
        // Indicates that the string is closed now
        stringOpened = false;
        // Add the char to the buffer
        buffString  += '"';
        // Ignore the next instructions
        continue ;
      }

      // If a string is opened
      if(stringOpened) {
        // Add this character to the buffer
        buffString += char;
        // Ignore the next instructions
        continue ;
      }

      // If the char is a space...
      if(char === ' ' || char === String.fromCharCode(160)) {
        // If we're in a function call...
        if(functionCall.length)
          // Add it to the buffer
          p_buff += ' ';

        // Else, it's ignored
        // Ignore the next instructions
        continue ;
      }

      // If the current character is an operator...
      if('+-*/^'.indexOf(char) !== -1) {
        // Here is the buffer
        let buff = buffString || buffLetter || (!floating ? buffInt : buffInt + '.' + buffDec);
        // Is there already one or more operations on this part of the expression ?
        let someOps = !!numbers.length;
        // Position at the buffer's beginning
        let bl = - /* negative value */ (buff.length + 1 /* we're at the operator char, next to the buffer */);

        // If that's the last operator and no value was given...
        if(i === expr.length && !buff)
          return _e('Missing something here', -2);

        // If that's not the last operator but the 'void' type was used...
        if(i !== expr.length && (g_type === 'void' || g_type === 'inst'))
          return _e('Can\'t use operations with a void function');

        // If that's not the last operator and the type is static...
        if(i !== expr.length && staticType)
          return _e('Type "' + staticType + '" is a static type, operations are not supported');

        // If the operator is '-' and no operation was done...
        if(char === '-' && !numbers.length) {
          // That's the negative symbol, not an operator. But because the parser
          // only supports operators, put a '0' instead of the empty buffer.
          buff = '0';
        }

        if(!buff)
          return _e('Missing number before operator', bl);

        if(floating && !buffDec)
          return _e('Missing decimal part of floating number', bl);

        if(g_type === 'string' && char !== '+')
          return _e('Only the "+" operator is allowed in string expressions', bl);

        // If a combination was used...
        if(combination) {
          // If the combination is not known...
          if(!combinations.includes(combination))
            return _e('Invalid combinations syntax');

          // Set the buffer
          buff = leftCombination + ' ' + combination + ' ' + buff;
        }

        numbers.push(buff);

        // The last item
        let item = buff, type;

        // If the item is a sub-expression...
        if(item.startsWith('$')) {
          // If that's a function call...
          if(parts[item.substr(1)].function) {
            // The item has the type of the function it refers to
            type = UBL.functions[parts[item.substr(1)].function][0];
            // If that's an instruction
            if(type === 'inst') {
              // Use the 'void' type instead
              type = 'void';
              // Indicates that we are using an instruction
              isInstruction = true;
            }
          } else // If that's a sub-expression...
            // The item has the type of the sub-expression
            type = parts[item.substr(1)].type;
        } else
        // If it's a combination...
        if(combination)
          type = 'number';
        else // If it's a "normal" content
          // Get the item's type
          type = UnderBasic.getType(item, extended, variables);

        // Check types
        if(typeof type === 'object')
          return _e(type.content, bl);

        // If that's a static type...
        // AND there were already some operation(s) before...
        if(staticTypes.includes(type)) {
          if(someOps)
            return _e('Type "' + type + '" is a static type and doesn\'t support operations');

          staticType = type;
        }

        // If the type is different from the global one...
        // Excepted the 'number' type, which can use operations on any
        // non-static type.
        if(g_type && type !== g_type && g_type !== 'number' && type !== 'number')
          return _e('Type mismatch : Can\'t use operations between ' + g_type + ' and ' + type);

        // If the type is not number
        // OR there is no type set
        // If the global type is 'list', and that list is divided by 2, the type
        // must NOT change, so the 'number' type don't have to override the
        // 'list' one.
        // Also, ignore the 'mixed' type
        if(type !== 'number' && type !== 'mixed' || !g_type)
          // Set the type as global
          g_type = type;

        // Add the number to the list
        numbers.push(char);
        // Set the (new) current operator
        operator = char;

        // Reset current number
        buffInt     = '';
        buffDec     = '';
        buffLetter  = '';
        buffString  = '';
        combination = '';
        floating    = false;
        leftCombination = null;
      } else
      // If it's a digit...
      if('0123456789'.indexOf(char) !== -1) {
        if(buffLetter)
          buffLetter += char;
        else if(g_type === 'string')
          return _e('Can\'t put a number into a string expression');
        else if(!floating)
          buffInt += char;
        else
          buffDec += char;
      } else
      // If it's a point (integer-decimal separator symbol)
      if(char === '.') {
        if(floating)
          return _e('Can\'t use two times the "." symbol in a number');

        if(buffString)
          return _e('Can\'t use the "." symbol after a string');

        if(buffLetter)
          return _e('Can\'t use the "." symbol after a name');

        if(!buffInt)
          buffInt = '0';

        floating = true;
      } else
      // If it's a letter...
      if(char.match(/[a-zA-Z_]/)) {
        // If a number was specified...
        if(buffInt || floating || buffString ||combination) {
          // If the following operations were not already do...
          if(!combination) {
            // Define it as the left part of combination
            leftCombination = buffString || (buffInt + (floating ? '.' : '') + buffDec);
            // Reset the buffers
            buffInt = ''; buffDec = ''; floating = null;
          }

          // Set the combination operator symbol
          combination += char;
        } else
          buffLetter += char;
      } else
      // If that's a quote...
      if(char === '"') {
        stringOpened = true;
        buffString   = '"';

        continue ;
      } else if(char === '$') {
        // '$' is a special symbol which refers to a function call
        // It can only be placed at the beginning of an argument
        // So, if the buffer already contains some data...
        if(buffLetter)
          return _e('Syntax error : The arguments referer symbol cannot be used here');

        // Set the buffer with that special symbol
        buffLetter = '$'
      } else
        return _e('Syntax error : Unknown symbol');
    }

    // If a parenthesis was not closed...
    if(p_count)
      return _e(p_count + ' parenthesis not closed');

    // Push the last part of the expression
    numbers.push(!floating ? buffInt : buffInt + '.' + buffDec);

    // The response
    let ret = { numbers: numbers.slice(0, numbers.length - 2), parts };
    // Attach the expression's type
    ret.type = g_type || staticType || 'number';
    // If the expression was an instruction call...
    if(isInstruction)
      // Indicates it
      ret.instruction = true;

    // If there is still a buffer...
    if(buffInt || buffDec || buffString || buffLetter)
      return _e('Syntax error', -(buffInt || buffDec || buffString || buffLetter).length);

    // Return the response !
    return ret;
  };

  // Export data into the library
  UBL = {
    types, short_types, extended_types, short_extended_types,
    allTypes: types.concat(short_types).concat(extended_types).concat(short_extended_types),
    // Native variables...
    native: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(
            [ "Str0", "Str1", "Str2", "Str3", "Str4", "Str5", "Str6", "Str7", "Str8", "Str9",
              "Pic0", "Pic1", "Pic2", "Pic3", "Pic4", "Pic5", "Pic6", "Pic7", "Pic8", "Pic9",
              "GDB0", "GDB1", "GDB2", "GDB3", "GDB4", "GDB5", "GDB6", "GDB7", "GDB8", "GDB9",
              "Y0", "Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7", "Y8", "Y9",
              "L1", "L2", "L3", "L4", "L5", "L6",
              "theta", "answer", "u", "v", "w", "n" ])
  };

  // ... and functions
  UBL.functions = {
    abs: ['number', 'number'],
    angle: ['number', 'number'],
    Archive: ['inst', 'program'],
    Asm: ['void', 'program'],
    AsmComp: ['void', 'program', 'program'],
    AsmPrgm: ['inst'],
    augment: ['matrix', 'matrix', 'matrix'],
    "AUTO Answer": ['inst'],
    AxesOff: ['inst'],
    AxesOn: ['inst'],
    "a+bi": ['inst'],
    bal: ['number', 'number', '[number]'],
    binomcdf: ['number', 'number', 'number', '[number]'],
    binompdf: ['number', 'number', 'number', '[number]'],
    Boxplot: ['inst'],
    checkTmr: ['number', 'number'],
    Circle: ['void', 'number', 'number', 'number'],
    CLASSIC: ['inst'],
    "Clear Entries": ['inst'],
    ClockOff: ['inst'],
    ClockOn: ['inst'],
    ClrList: ['inst', 'list*'],
    ClrAllLists: ['inst'],
    ClrTable: ['inst'],
    conj: ['number', 'number'],
    Connected: ['inst'],
    CoordOff: ['inst'],
    CoordOn: ['inst'],
    cos: ['number', 'number'],
    arccos: ['number', 'number'],
    cosh: ['number', 'number'],
    arccosh: ['number', 'number'],
    CubicReg: ['void', '[list*]', '[list*]'],
    cumSum: ['matrix', 'list'],
    dayOfWk: ['number', 'number', 'number', 'number'],
    dbd: ['number', 'number', 'number'],
    "DEC Answer": ['inst'],
    Degree: ['inst'],
    DelVar: ['inst', 'mixed*'],
    DependAsk: ['inst'],
    DependAuto: ['inst'],
    det: ['number', 'matrix'],
    DiagnosticOff: ['inst'],
    DiagnosticOn: ['inst'],
    dim: ['number', 'list'],
    Disp: ['inst', 'mixed'],
    DispGraph: ['inst'],
    DispTable: ['inst'],
    Dot: ['inst'],
    DrawF: ['inst', 'expression'],
    DrawInv: ['inst', 'expression'],
    "e^": ['number', 'number'],
    sigma: ['number', 'expression', 'number*', 'number', 'number'],
    ">EFF": ['number', 'number', 'number', 'number'],
    Else: ['inst'],
    End: ['inst'],
    Eng: ['inst'],
    "Equ>String": ['void', 'yvar*', 'string*'],
    ExecLib: ['inst'],
    expr: ['number', 'string'],
    ExprOff: ['inst'],
    ExprOn: ['inst'],
    Fcdf: ['number', 'number', 'number', 'number', 'number'],
    ">F<>D": ['inst'],
    Fill: ['void', 'number', 'list*'],
    Fix: ['inst', 'number'],
    Float: ['inst'],
    fMax: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    fMin: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    fnInt: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    FnOff: ['inst', 'number'],
    FnOn: ['inst', 'number'],
    For: ['void', 'number*', 'number', 'number'],
    fPart: ['number', 'number'],
    Fpdf: ['number', 'number', 'number', 'number'],
    "FRAC Answer": ['inst'],
    Full: ['inst'],
    Func: ['inst'],
    GarbageCollect: ['inst'],
    gcd: ['number', 'number', 'number'],
    geometcdf: ['number', 'number', 'number'],
    geometpdf: ['number', 'number', 'number'],
    Get: ['void', 'mixed*'],
    GetCalc: ['void', 'mixed*'],
    getDate: ['list'],
    getDtFmt: ['number'],
    getDtStr: ['string', 'number'],
    getTime: ['list'],
    getTmFmt: ['number'],
    getTmStr: ['number'],
    getKey: ['number'],
    Goto: ['inst', 'label'],
    GraphStyle: ['void', 'number', 'number'],
    GridOff: ['inst'],
    GridOn: ['inst'],
    "G-T": ['inst'],
    Histogram: ['inst'],
    Horiz: ['inst'],
    Horizontal: ['inst', 'number'],
    identity: ['matrix', 'number'],
    If: ['inst', 'mixed'],
    imag: ['number', 'number'],
    IndpntAsk: ['inst'],
    IndpntAuto: ['inst'],
    Input: ['inst', 'string*', '[string]'],
    inString: ['number', 'string', 'string'],
    int: ['number', 'number'],
    EInt: ['number', 'number', 'number', '[number]'],
    invNorm: ['number', 'number', '[number]', '[number]'],
    invT: ['number', 'number', 'number'],
    iPart: ['number', 'number'],
    irr: ['number', 'number', 'list'],
    isClockOn: ['bool'],
    LabelOff: ['inst'],
    LabelOn: ['inst'],
    Lbl: ['inst', 'label'],
    lcm: ['number', 'number', 'number'],
    length: ['number', 'string'],
    Line: ['void', 'number', 'number', 'number', 'number', '[0]'],
    "LinReg_a+bx": ['inst', '[list*]', '[list*]'],
    "LinReg_ax+b": ['inst', '[list*]', '[list*]'],
    LinRegTInt: ['inst', 'list*', 'list*', 'list*', 'number*', 'yvar*'],
    LinRegTTest: ['inst', 'list*', 'list*'],
    "^List": ['list', 'list'],
    "List>matr": ['void', 'list*', 'matrix*'],
    ln: ['number', 'number'],
    LnReg: ['inst'],
    log: ['number', 'number'],
    logBASE: ['number', 'number', 'number'],
    Logistic: ['inst', 'list*', 'list*'],
    "Manual-Fit": ['inst', 'yvar*'],
    MATHPRINT: ['inst'],
    "Matr>List": ['void', 'matrix', 'list*'],
    max: ['number', 'number', 'number'],
    mean: ['number', 'list', '[list]'],
    median: ['number', 'list', '[list]'],
    "Med-Med": ['inst', 'list*', 'list*', 'list*', 'number*', 'yvar*'],
    min: ['number', 'number', 'number'],
    ModBoxplot: ['inst'],
    nCr: ['number', 'number', 'number'],
    "n/d": ['inst'],
    nDeriv: ['number', 'number', 'number', 'number', '[number]'],
    ">n/d<>Un/d": ['inst'],
    ">Nom": ['number', 'number', 'number'],
    Normal: ['inst'],
    normalcdf: ['number', 'number', 'number', '[number]', '[number]'],
    normalpdf: ['number', 'number', '[number]', '[number]'],
    NormProbPlot: ['inst'],
    not: ['number', 'mixed'],
    nPr: ['number', 'number', 'number'],
    npv: ['number', 'number', 'number', 'list', '[list]'],
    OpenLib: ['void', 'unprefix_program'],
    Output: ['void', 'number', 'number', 'string'],
    Param: ['inst'],
    Pause: ['inst', '[string]'],
    PlotsOff: ['inst', 'number', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]'],
    PlotsOn: ['inst', 'number', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]', '[number]'],
    Pmt_Bgn: ['inst'],
    Pmt_End: ['inst'],
    poissoncdf: ['number', 'number', 'number'],
    poissonpdf: ['number', 'number', 'number'],
    Polar: ['inst'],
    PolarGC: ['inst'],
    prod: ['number', 'list', 'number', 'number'],
    Prompt: ['inst', 'number*'],
    "1-PropZInt": ['inst', 'number', 'number', '[number]'],
    "2-PropZInt": ['inst', 'number', 'number', '[number]'],
    "1-PropZTest": ['inst', 'number', 'number', 'number', '[number]', '[number]'],
    "2-PropZTest": ['inst', 'number', 'number', 'number', '[number]', '[number]'],
    "Pt-Change": ['void', 'number', 'number'],
    "Pt-Off": ['void', 'number', 'number', '[number]'],
    "Pt-On": ['void', 'number', 'number', '[number]'],
    PwrReg: ['inst', '[list*]', '[list*]'],
    "Pxl-Change": ['void', 'number', 'number'],
    "Pxl-Off": ['void', 'number', 'number'],
    "Pxl-On": ['void', 'number', 'number'],
    "pxl-Test": ['number', 'number', 'number'],
    "P>Rx": ['number', 'number', 'number'],
    "P>Ry": ['number', 'number', 'number'],
    QuadReg: ['inst', '[list*]', '[list*]'],
    QuartReg: ['inst', '[list*]', '[list*]'],
    Radian: ['inst'],
    randBin: ['number', 'number', 'number', '[number]'],
    randInt: ['number', 'number', 'number', '[number]'],
    randM: ['matrix', 'number', 'number'],
    randIntNoRep: ['list', 'number', 'number'],
    randNom: ['number', 'number', 'number', '[number]'],
    Real: ['inst'],
    real: ['number', 'number'],
    RecallGDB: ['inst', 'number'],
    RecallPic: ['inst', 'number'],
    RectGC: ['inst'],
    ref: ['matrix', 'matrix'],
    Repeat: ['inst', 'number'],
    Return: ['inst'],
    round: ['number', 'number', '[number]'],
    "*row": ['matrix', 'number', 'matrix', 'number'],
    "row+": ['matrix', 'matrix', 'number', 'number'],
    "*row+": ['matrix', 'number', 'matrix', 'number', 'number'],
    rowSwap: ['matrix', 'matrix', 'number', 'number'],
    rref: ['matrix', 'matrix'],
    "R>Pr": ['number', 'number', 'number'],
    Scatter: ['inst'],
    Sci: ['inst'],
    Select: ['inst', 'number', 'number'],
    Send: ['void', 'mixed*'],
    seq: ['number', 'number', 'number*', 'number', 'number'],
    Seq: ['inst'],
    Sequential: ['inst'],
    SetUpEditor: ['inst', 'list*'],
    Shade: ['void', 'expression', 'expression', '[number]', '[number]', '[number]', '[number]'],
    "ShadeX²": ['void', 'number', 'number', 'number'],
    ShadeF: ['void', 'number', 'number', 'number', 'number'],
    ShadeNorm: ['void', 'number', 'number', '[number]', '[number]'],
    Shade_t: ['void', 'number', 'number', 'number'],
    Simul: ['inst'],
    sin: ['number', 'number'],
    arcsin: ['number', 'number'],
    sinh: ['number', 'number'],
    arcsinh: ['number', 'number'],
    SinReg: ['inst', 'list*', 'list*'],
    solve: ['inst', 'expression', 'number*', 'number', 'list*'],
    SortA: ['void', 'list*'],
    SortD: ['void', 'list*'],
    startTmr: ['number'],
    stdDev: ['number', 'list', '[list]'],
    Stop: ['inst'],
    StoreGDB: ['inst', 'number'],
    StorePic: ['inst', 'number'],
    "String>Equ": ['void', 'string', 'yvar*'],
    sub: ['void', 'string', 'number', 'number'],
    sum: ['number', 'list', '[number]', '[number]'],
    tan: ['number', 'number'],
    arctan: ['number', 'number'],
    Tangent: ['void', 'expression', 'number'],
    tanh: ['number', 'number'],
    arctanh: ['number', 'number'],
    tcdf: ['number', 'number', 'number', 'number'],
    Text: ['void', 'number', 'number', '[string]'],
    Then: ['inst'],
    Time: ['inst'],
    timeCnv: ['number', 'list'],
    tpdf: ['number', 'number', 'number'],
    Trace: ['inst'],
    tvm_FV: ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    "tvm_I%": ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    tvm_N: ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    tvm_Pmt: ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    tvm_PV: ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    UnArchive: ['inst', 'mixed*'],
    "Un/d": ['inst'],
    uvAxes: ['inst'],
    uwAxes: ['inst'],
    "1-Var Stats": ['inst', 'list*', 'list*'],
    "2-Var Stats": ['inst', 'list*', 'list*'],
    variance: ['list', 'list', 'list'],
    Vertical: ['inst', 'number'],
    vwAxes: ['inst'],
    Web: ['inst'],
    While: ['inst', 'mixed'],
    xor: ['inst', 'number', 'number'],
    xyLine: ['inst'],
    ZBox: ['inst'],
    ZDecimal: ['inst'],
    "ZFrac1/2": ['inst'],
    "ZFrac1/3": ['inst'],
    "ZFrac1/4": ['inst'],
    "ZFrac1/5": ['inst'],
    "ZFrac1/8": ['inst'],
    "ZFrac1/10": ['inst'],
    ZInteger: ['inst'],
    ZInterval: ['inst', 'number', 'list', 'number'],
    "Zoom In": ['inst'],
    "Zoom Out": ['inst'],
    ZoomFit: ['inst'],
    ZoomRcl: ['inst'],
    ZoomStat: ['inst'],
    ZoomSto: ['inst'],
    ZPrevious: ['inst'],
    ZQuadrant1: ['inst'],
    ZSquare: ['inst'],
    ZStandard: ['inst'],
    "Z-Test": ['inst', 'number', 'number', 'list', 'number'],
    ZTrig: ['inst']
  };

  // Keywords
  UBL.keywords = UBL.allTypes.concat([ "var", "let", "declare", "local" ]);
  UBL.builtins = Reflect.ownKeys(UBL.functions);

})());

// Extend the Array's prototype
Array.prototype.last = function() {
  return this[this.length - 1];
};

// Debug function
const d = e => console.log(JSON.parse(JSON.stringify(e)));
