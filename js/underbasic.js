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
    * @param {number} [line] The error's line number
    * @returns {object}
    */
  function _error(message, params = {}, column = 0, line = 0) {
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
      line   : line,
      message: message,
      failed : true,
      content: message.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, name) => params[name])
    };
  }

  /**
    * Format an error object to be compatible with compiler's context
    * @param {string} line
    * @param {object} error
    * @param {number} [inc_col] Increase the column index
    * @param {number} [overrideLine]
    * @returns {object} error
    */
  function _formatError(line, obj, inc_col = 0, overrideLine) {
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
    obj.content = `ERROR : At line ${(overrideLine || obj.line) + 1}, column ${obj.column + 1} : \n\n${part}\n${' '.repeat(cursor)}^\n${' '.repeat(cursor)}${obj.content}`;

    // Return the final error object
    return obj;
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
  const staticTypes = [ "picture", "gdb", "program", "appvar", "group", "application", "void", "inst" ];

  /** The combinations
    * @type {array} */
  const combinations = [ "and", "or", "xor" ];

  /** The errors width
    * @type {number} */
  let errorWidth = 20;

  /** The current unnative calls catcher
    * @type {function|void} */
  let _currentUnnativeCatcher = null;

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
    name.match(/^prgm[A-Z0-9]{1,8}$/) ? 'program' :
    name.match(/^appv[A-Z0-9]{1,8}$/) ? 'appvar' :
    name.match(/^group[A-Z0-9]{1,8}$/) ? 'group' :
    name.match(/^app[A-Z0-9]{1,8}$/) ? 'application' :
    null;

  /**
    * Get the type of a given content
    * @param {string} content
    * @param {object} [variables] Search through a set of variables
    * @param {boolean} [dontParse] Do not parse the expression to increase the speed
    * @returns {string|object} type Error object if the type is unknown
    */
  this.getType = (content, variables = {}, aliases = {}, functions = {}, dontParse = false) => {
    // Type get using @getVarType
    let type = this.getVarType(content);
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
        if(this.getType(list[i], variables, aliases, functions) !== 'number')
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
    let parsed = this.parse(content, variables, aliases, functions, null, _currentUnnativeCatcher);
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
    * @param {object} [variables] variables
    * @param {object} [aliases] aliases
    * @param {object} [functions] functions
    * @param {object} [expr] The parsed expression
    * @returns {boolean} working
    */
  this.match = (content, parent, variables, aliases, functions, expr) => {
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

    // If the expected type is 'label'...
    if(parent === 'label')
      // Return the result
      return !!content.match(/^[A-Z0-9]{1,2}$/);

    // Get type, throught the variables or considering it's a variable name
    let type = variables && variables.hasOwnProperty(content) ? variables[content] : this.getVarType(content, true);
    // If a type was found...
    if(type) // We know that the content is a pointer
      return (parent.endsWith('*') ?
              type === parent.substr(0, parent.length - 1) :
              (parent.endsWith('~') ? false : type === parent))
              || parent === 'mixed*' || parent === 'mixed'
              || type === 'mixed';
    // Now we know that's not a pointer, so, if the expected type is a pointer...
    if(parent.endsWith('*'))
      // Return false
      return false;

    // We can also remove the '~' symbol (if it was specified)
    if(parent.endsWith('~'))
      parent = parent.substr(0, parent.length - 1);

    // Get the type
    type = this.getType(content, variables, aliases, functions, !!expr);

    // If the found type is 'number'...
    if(type === 'number')
      return (['expression', 'number', 'mixed']).includes(parent);

    // If a type was found...
    if(typeof type === 'string')
      // Check if it matches
      return type === parent || parent === 'mixed';

    // If the given variables is an expression object...
    if(expr) {
      // If the found type is 'number'...
      if(expr.type === 'number')
        return (['expression', 'number', 'mixed']).includes(parent);

      // Check the type
      return !expr.failed && (expr.type === parent || expr.type === 'mixed' || parent === 'mixed');
    }

    // Parse the content
    let parse = this.parse(content);
    // If an error occured...
    if(parse.failed)
      // Failed !
      return false;

    // If the found type is 'number'...
    if(parse.type === 'number')
      return (['expression', 'number', 'mixed']).includes(parse.type);

    // Here we have a successfully parsed content, we check its type...
    return (parse.type === parent || expr.type === 'mixed' || parent === 'mixed');
  };

  /**
    * Parse a plain matrix to an bi-dimensionnal array
    * @param {string} content
    * @param {object} [variables] The scope's variables
    * @param {object} [aliases] The scope's aliases set
    * @param {object} [functions] The scope's functions
    * @returns {array|object} matrix Object is an error occured
    */
  this.parseMatrix = (content, variables, aliases, functions) => {
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
        if(typeof this.getType(buff.trim(), variables, aliases, functions) === 'object')
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
        if(typeof this.getType(buff, variables, aliases, functions) === 'object')
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
      * Return an error object
      * @param {string} message
      * @param {object|number} [params] Parameters or column number
      * @param {number} [column]
      * @returns {object}
      */
    function error(message, params, column) {
      return _formatError(line, _error(message, params, column, row));
    }

    // Split code into lines
    let lines = code.split('\n');
    // Number of the line
    let row = 0;
    // Declared functions
    // Here we put a '$$' function because if we pass an empty object to the
    // @parse function, it will not use the native library
    // That doen't make any problem because '$$' will throw a syntax error if
    // it is used.
    let functions = { '$$': true };
    // The content of all functions
    let functionsContent = {};
    // Declared variables
    let variables = { theta: 'number', e: 'number', pi: 'number', n: 'number', i: 'number', answer: 'mixed' };
    // Aliases (linked to variables)
    let aliases = { theta: 'theta' };
    // Used aliases (for variables)
    let used = { real: 0, str: 0, list: 0, matrix: 0, yvar: 0, pic: 0, gdb: 0 };
    // Output
    let output = [];
    // The current line's content (must be global to be read by formatError)
    let line = '';
    // A temporary variable for storing regex matches
    let match = [];

    // For each line in the code...
    for(row = 0; row < lines.length; row++) {
      // Get the current line,
      // Trim it,
      // Remove a potential ';' symbol at the end of the line
      line = lines[row].trim().replace(/;+$/, '');
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
        // The parsed assigned content (if there is one)
        // We made it global because at the end of this <if> block we output
        // the assigned content
        let parsed;

        // If something is assigned...
        if(assign) {
          // Parse it
          parsed = this.parse(assign, variables, aliases, functions, null, (error) => error('Unnative calls are not currently supported in variables declaration'));
          // If an error occured...
          if(parsed.failed)
            return _formatError(line, parsed, match[1].length + match[2].length + match[3].length + shift);
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
        if(!this.getType(match[3]).failed)
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
        // If a value was assigned, output it
        if(assign)
          output.push(parsed.formatted + '->' + alias);
      }
      // If that's an assignment...
      else if(match = line.match(/^([a-zA-Z0-9_]+)( *)(\+|\-|\*|\/|)( *)=( *)(.*)$/)) {
        // If the assigned variable is not defined...
        if(!variables.hasOwnProperty(match[1]))
          return error('Variable "${name}" is not defined', { name: match[1] });

        // The content's position in the string
        let pos = match[1].length + match[2].length + match[3].length + match[4].length + match[5].length + 1;
        // First, we parse the given result...
        let parsed = this.parse(match[6], variables, aliases, functions, null, (error) => error('Unnative calls not currently supported here'));
        // The variable's type
        let type = this.getType(match[6], variables, aliases, functions, parsed);

        // If this type is not known...
        if(typeof type === 'object')
          return _formatError(line, type, pos);

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
        output.push(parsed.formatted + '->' + aliases[match[1]]);
      }
      // If that's a function declaration...
      else if(match = line.match(/^([a-zA-Z]+)( *)([a-zA-Z0-9_]+)( *)\((.*)\)( *)\{(.*)$/)) {
        // If this function was already defined...
        if(UBL.functions.hasOwnProperty(match[3]))
          return error('Function name "${name}" is already used', { name: match[3] }, 8 + match[1].length + match[2].length);
        // If that's a variable name...
        if(variables.hasOwnProperty(match[3]))
          return error('"${name}" is a variable name (${type})', { name: match[3], type: variables[match[3]] }, 8 + match[1].length + match[2].length);

        if(!this.getType(match[3]).failed)
          return error('"${name}" is a reserved name', { name: match[3] });

        // The function's type
        let type = match[1];

        // Check the type...
        // If that's "void" or "function"
        if(type === 'function')
          match[1] = 'void';
        // Allow "mixed" and "mixed*" types
        else if(!(['void', 'mixed', 'mixed*']).includes(type)) {
          // If that's a shorten type...
          if(short_types.includes(type))
            // Make it the real one
            type = types[short_types.indexOf(type)];
          else
            // If that's not a known type...
            if(!types.includes(type) && type !== 'mixed')
              return error('Unknown type "${type}"', { type });
        }

        // All final arguments
        let args = [], argsOut = [] /* contains a content like any native function */;

        // If at least one argument is provided...
        if(match[5].trim()) {
          // Split the declaration's arguments
          let parsed = match[5].split(',');
          // Get the arguments' beginning position (for errors traceback)
          let pos = 9 + match[1].length + match[2].length + match[3].length + match[4].length;

          // For each given argument...
          for(let i = 0; i < parsed.length; i++) {
            // Get the current argument
            let giv = parsed[i].trim(), arg = {};
            // Define a local 'match' variable to don't erase the initial one
            let match;

            // Match its format
            // e.g. name
            if(match = giv.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/))
              arg = {name: match[0], type: 'mixed'};
            // e.g. number name
            else if(match = giv.match(/^([a-zA-Z\*]+)( +)([a-zA-Z_][a-zA-Z0-9_]*)$/))
              arg = {name: match[3], type: match[1]};
            // e.g. [name]
            else if(match = giv.match(/^\[( *)([a-zA-Z_][a-zA-Z0-9_]*) *\]$/))
              arg = {name: match[2], type: 'mixed', optionnal: true};
            // e.g. number [name]
            else if(match = giv.match(/^([a-zA-Z\*]+)( +)\[( *)([a-zA-Z_][a-zA-Z0-9_]*) *\]$/))
              arg = {name: match[1], type: match[4], optionnal: true};
            // e.g. [name] = <default value>
            else if(match = giv.match(/^\[( *)([a-zA-Z_][a-zA-Z0-9_]*)( *)\]( *)=( *)(.*)$/))
              arg = {name: match[2], type: 'mixed', optionnal: true, defaultVal: match[6]};
            // e.g. number [name] = <default value>
            // NOTE: Here spaces are only optionnal because we know that the type
            //       is separated from the name by the '[' character.
            else if(match = giv.match(/^([a-zA-Z\*]+)( *)\[( *)([a-zA-Z_][a-zA-Z0-9_]*)( *)\]( *)=( *)(.*)$/))
              arg = {name: match[4], type: match[1], optionnal: true, defaultVal: match[8]};
            // Invalid syntax
            else
              return error('Invalid argument syntax', pos);

            // The argument's type
            // NOTE: The last asterisk is ignored
            let type = arg.type.replace(/\*$/, '');

            // Check the type...
            // If that's a shorten type...
            if(short_types.includes(type))
              // Make it the real one
              type = types[short_types.indexOf(type)];
            else
              // If that's not a known type...
              if(!types.includes(type) && type !== 'mixed')
                return error('Unknown type "${type}"', { type: arg.type });

            // Forbid reserved names
            if(!this.getType(arg.name, variables, functions).failed)
              return error('${name} is a reserved name', { name: arg.name });

            // Push the argument to the list...
            args.push(arg);
            // ...and add it to the final output
            argsOut.push(arg.optionnal ? '[' + arg.type + ']' : arg.type);
          }
        }

        // The sub-expression buffer
        let _buff = match[7];
        // The number of opened brackets
        let openedB = 1;
        // Was a quote opened ?
        let openedQuote = false;
        // Initialize the column index as 'i'
        let i = -1;
        // Backup the original row, because we'll override it soon
        let org = row;
        // Increase the line index one time
        row ++;
        // Get the current line
        let line = lines[row];
        // Initialize the current character
        let char = '';

        // While the matching closing bracket is not reached...
        while((char !== '}' || openedB || openedQuote) && (row < lines.length)) {
          // Increase the column index
          i ++;

          // Set the current character
          char = line.charAt(i);

          // Append the current char to the buffer
          _buff += char;

          // Quote
          if(char === '"') {
            // If there was an opened quote
            if(openedQuote)
              // Mark it as closed
              openedQuote = false;
            else
              // Indicates that a quote was opened
              openedQuote = true;
          }

          // If a quote is opened, ignore everything else
          if(!openedQuote) {
            // Opening bracket
            if(char === '{')
              // Increase the opened bracket counter
              openedB ++;

            // Closing bracket
            if(char === '}')
              // Decrease the opened bracket counter
              openedB --;
          }

          // If we reached the end of the line...
          if(i >= line.length - 1) {
            // Increase the lines counter
            row ++;
            // Get the new line
            line = lines[row];
            // Add an '\n' to the buffer
            _buff += '\n';
            // Reset the column index
            i = -1;
            // Strings can be contained only on single lines...
            openedQuote = false;
          }
        }

        // If no bracket was encountered...
        if(char !== '}') {
          // NOTE: Here we put the cursor to the beginning of the not-closed
          //       function
          // Restore the original row...
          row = org;
          // ...and throw the error
          return error('This function doesn\'t have an end', match[1].length + match[2].length);
        }

        // Remove the string's last character (it's the closing parenthesis)
        // We also remove a potential '\n' at the end of the buffer, which can
        // be caused if the final closing bracket is the last character of a
        // line
        if(_buff.substr(-1) === '\n') {
          // Remove the character
          _buff = _buff.replace(/\n$/, '');
          // Decrease the row too
          row --;
        }

        // Store the function
        functions[match[3]] = [match[1]].concat(argsOut);
        // Store the function's content
        functionsContent[match[3]] = _buff.substr(0, _buff.length - 1);
      }
      // Here we know that's a plain expression
      // Its result will be stored by the interpreter to the "Ans" variable
      else {
        // Is the expression an unnative 'void'-typed function call ?
        let unnativeCall = false;

        // If this is a function called without parenthesis...
        if(match = line.match(/^([a-zA-Z][a-zA-Z0-9_]+)( +)([^\+\-\*\/\(].*)$/))
          // Change the line's syntax to add parenthesis
          line = match[1] + match[2] + '(' + match[3] + ')';

        // The result of the line's parsing
        let result = this.parse(line, variables, aliases, functions, null, (error, name, args) => {
          // For the moment, only the custom instructions are supported
          if(functions[name][0] !== 'void')
            return error('S', 'Sorry, only instructions are currently supported');

          // Decrease the row number
          row --;
          // Insert the function's code
          lines = lines.slice(0, row + 1).concat(functionsContent[name].split('\n')).concat(lines.slice(row + 2));
          // Indicates that an unnative 'void'-typed function was called
          unnativeCall = true;
        });

        // If an error occured during the parsing...
        if(result.failed)
          return _formatError(line, result, null, row);

        // Output only if the expression is not a unnative instruction call
        if(!unnativeCall) {
          // If that's NOT an instruction...
          if(!result.instruction)
            output.push(result.formatted);
          else // If that IS an instruction...
            output.push(result.formatted.replace(/^([a-zA-Z0-9_]+)\((.*)\)$/, '$1 $2'));
        }
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

  // Rewrite this file step by step for the UnderBasic project
  // And make a lot of commits with it to permit backtracing for errors that can
  // happens in this program after a change.

  /**
    * Parse an expression
    * @param {string} expr
    * @param {object} [vars] Scope variables
    * @param {object} [aliases] Aliases for variables names and definitions
    * @param {object} [functions] Scope functions
    * @param {string} [separator] Consider it the expression as a set of expressions, separated by a single character
    * @returns {object}
    */
  this.parse = (expr, vars = {}, aliases = {}, functions = {}, separator, unnativeCatcher) => {
    /**
      * Generate an error object
      * @param {string} type The error's type, in one letter
      * @param {string} msg
      * @param {number|object} [sub] Subtract a column index OR the variables
      * @param {number} [sub2] Substract a column index (use if variables are given)
      * @returns {object} The error object
      */
    function error(type, msg, sub = 0, sub2 = 0) {
      // The error object to return
      let err = _error(
        ({
          A: 'Argument mismatch',
          D: 'Data type',
          R: 'Reference error',
          S: 'Syntax error',
          T: 'Type mismatch'
        })[type] + ' : ' + msg,
        (typeof sub === 'object' ? sub : {}),
        i - (typeof sub === 'number' ? sub : 0) - sub2
      );

      // Attach informations
      err.parse_type    = type;
      err.parse_message = msg;
      err.parse_errvars = (typeof sub === 'object' ? sub : {});

      // Return the object
      return err;
    }

    /**
      * Build the final object to return
      * NOTE: The code is put into a separated function because it is used twice
      * @param {boolean} [forceClassic] Force the function to return the classic object (prevent for returning a set)
      * @returns {object}
      */
    function buildReturn(forceClassic = false) {
      // If the expression was composed of a set...
      if(separator && !forceClassic) {
        // Attach the 'unnative' data to the set...
        set.unnativeCalls = unnative;
        // ...the formatted content...
        set.formatted = formatted.replace(/,\+,$/, '').replace(/\+$/, '').replace(/,$/, '') /* Remove useless characters */;
        // ...and return it
        return set;
      } else // If that was a standard expression...
        return {
          type: g_type || 'number',
          formatted: formatted.replace(/,\+,$/, '').replace(/\+$/, '').replace(/,$/, '') /* Remove useless characters */,
          static: !!(staticType),
          instruction: (g_type === 'inst'),
          unnativeCalls: unnative
        };
    }

    // Backup the current unnative event catcher
    _currentUnnativeCatcher = unnativeCatcher;

    // If the native functions are not present, but functions were specified...
    if(Object.keys(functions).length && !functions['$'] /* There is a '$' field in UBL.functions */) {
      // The '$' field permit to detect that the native library is present
      // Because compiler doesn't allow '$' symbol in functions names, that will
      // not make any problem

      // Backup the original functions library
      let lib = functions;
      // Put the library into the 'functions' object
      // Here we use 'JSON' model because if we just take UBL.functions, when
      // we'll modify any function, it will override the original library
      functions = JSON.parse(JSON.stringify(UBL.functions));
      // Now we can merge the two objects. We injected the original library and
      // next we merge the given functions because the merge operation is the
      // slowest one, so we have to have the smallest amount of functions
      // as we can, here we just have to merge the given functions.
      for(let name of Reflect.ownKeys(lib))
        functions[name] = lib[name];
    }

    // The most part of the assignments are just here to see the variables' type
    // The current operator
    // NOTE: It can contains 2 character if it's a composed operator
    let op = '';
    // Is that a composed operator ?
    let composed_op = false;
    // The buffer (one unique buffer for any content, number or list...)
    let buff = '';
    // How many characters passed since the beginning of the part ?
    let passed = 0;
    // The global type of the expression
    let g_type = null;
    // Current part's type
    let p_type = '';
    // Is the part finished ?
    let p_ends = false;
    // Has the expression a static type ?
    let staticType = false;
    // The current character
    let char = '';
    // The current column index
    let i = 0;
    // Was any operation performed before ?
    let alreadyOps = false;
    // Non-native functions calls
    let unnative = [];
    // The final formatted buffer
    let formatted = '';

    // === For expressions set only ===
    // The expression set
    let set = [];
    // The current content, it's all characters since the last separator or the
    // beginning of the expression
    let content = '';
    // Can we perform a separation ?
    let canSeparate = false;
    // Force the current character to be considered as a '+'
    let forcePlus = false;
    // The content's length increase (when a space is ignored, this variable is
    // increased)
    let orgLength = 0;
    // Number of characters passed since the beginning of the expression
    let fromBeginning = 0;
    // Spaces at the beginning of the expression
    let beginningSpaces = 0;

    // If the expression is empty...
    if(!expr.trim())
      expr = '0';

    // Add an operation at the end of the expression to calculate the last part
    expr += separator || '+';

    // For each character in the expression...
    for(i = 0; i < expr.length; i++) {
      // Get the current character
      char = forcePlus ? '+' : expr.charAt(i);
      if(forcePlus) forcePlus = false;

      // Ignore spaces...
      if(char === ' ') {
        // But increment the passed characters counter
        // If a content was specified into the buffer, the spaces before contents
        // are ignored
        if(buff)
          passed ++;

        // If there is no content in the buffer, and if we are in an expression
        // set, increase the 'spaces at the beginning' counter
        if(!content && separator)
          beginningSpaces ++;

        // Increase the original content length
        // This permit to know, even if the plain content was trimmed of its
        // spaces, its original length (especially for errors positions)
        if(separator)
          orgLength ++;

        continue ;
      }

      // Update the 'content' variable if the expression is composed of a set...
      // This code is put after the space checking because the spaces are ignored
      // in the final expressions
      if(separator)
        content += char;

      // Update the formatted buffer
      formatted += char;

      // Parenthesis
      if(char === '"') {
        // There musn't be a buffer, else there is already a content specified
        // here
        if(buff)
          return error('S', 'Can\'t put a quote here');

        // Increase the column index, else the first character seen by the loop
        // will be the opening quote...
        i++;
        // Reset character
        char = '';

        // While there is no closing quote...
        while(char !== '"' && i < expr.length) {
          // Add the current character to the string
          char = expr.charAt(i);
          // Append the character to the buffer
          buff += char;
          // Add the character to the content buffer
          if(separator)
            content += char;
          // Update the formatted buffer
          formatted += char;
          // Increase the column index
          i ++;
        }

        // If no quote was encountered...
        if(char !== '"')
          return error('S', 'Missing closing quote');

        // Set the part's type
        p_type = 'string';
        // Mark the part as finished
        p_ends = true;
        // Add the opening quote
        buff = '"' + buff;
        // Decrease the column index (I don't know why, but it works fine only
        // with this decreasing, is that a BUG ?)
        i --;
        // Increase the 'passed' counter
        passed += buff.length;
        // Continue loop
        continue ;
      }

      // Separator
      if(char === separator) {
        // Because the last item in the part will not be parsed (the last '+'
        // only affects the entire expression), we need to add this symbol at the
        // end of the part. For that, we add a '+' here, and set an interrupt to
        // true. If we encounter the separator again after the '+', then we know
        // that we can do the separation.
        if(!canSeparate) {
          i -= 2;
          forcePlus = true;
          canSeparate = true;
          // Continue loop
          continue ;
        }

        // Put the element into the set (force to return a parsed content)...
        set.push(buildReturn(true));
        // The current part
        let part = set[set.length - 1];
        // ...and add a few informations
        part.plain = content.substr(0, content.length - 2);
        // Attach the length
        part.length = part.plain.length + orgLength;
        // Attach the position from the beginning of the expression
        part.fromStart = fromBeginning;
        // Attach the position from the beginning of the expression (without the
        // spaces put at the beginning of the part)
        part.fromStartWithoutSpaces = part.fromStart + beginningSpaces;
        // Update the current position from the beginning of the expression
        fromBeginning += part.length + 1 /* Consider the comma */;
        // Update the formatted content
        formatted = formatted.substr(0, formatted.length - 2);
        // Reset variables
        op          = '';
        composed_op = false;
        buff        = '';
        passed      = 0;
        g_type      = null;
        p_type      = '';
        p_ends      = false;
        staticType  = false;
        content     = '';
        canSeparate = false;
        alreadyOps  = false;
        orgLength   = 0;
        beginningSpaces = 0;
        // Continue loop
        continue ;
      }

      // Operators
      else if('+-*/&|^'.includes(char)) {
        // If that's a composed operator
        // And if that's just the beginning of the compose operator...
        if('&|'.includes(char) && !composed_op) {
          // Memorize the operator
          op = char;
          // Continue loop
          continue ;
        }

        // If a composed operator was made,
        // Here we're sure the current character won't finish it
        if(composed_op)
          return error('S', 'Expecting for the second part of a composed operator ${op}', { op: op + op });

        // If the buffer refers to an alias...
        if(aliases.hasOwnProperty(buff)) {
          // Format the expression
          expr =
            expr.substr(0, i - buff.length) + /* "2 + " */
            aliases[buff] + /* "<lol>" */
            expr.substr(i) /*  + 2 */

          // TODO: It only supports single-char operators, fix it !
          // Change the formatted content by removing its last part
          formatted = formatted.substr(0, formatted.length - 1  - buff.length);

          // Put the column index on the beginning of the alias
          i -= buff.length + 1;
          // Reset the buffer
          buff = '';
          // Continue the loop
          continue ;
        }

        // Set the operator
        op += char;

        // A buffer is needed for doing operations
        // Here we also check for 'p_type' because when a content is given between
        // parenthesis it is parsed internally and the buffer is reset, only the
        // part's type is set.
        if(!buff && !p_type) {
          // The message changes if the operator is the auto-added '+' operator
          if(i === expr.length)
            return error('S', 'Expecting for an expression after the last operator');
          else
            return error('S', 'Expecting for an expression before an operator');
        }

        // Get the buffer's type
        let type = p_type || this.getType(buff, vars, aliases, functions);

        // If the parse failed...
        if(type.failed) {
          // If the given content is a variable's name...
          if(buff.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/))
            return error('R', 'Variable "${name}" does not exist', { name: buff }, passed);
          else // Else, that's an unknown kind of content
            return error('S', 'Unable to parse content', passed);
        }

        // If the main type of the expression is 'string',
        // The only supported operator is '+' (and the composed operators)
        if(((g_type === 'string' || type === 'string') && op.length === 1 && op !== '+')
         || (alreadyOps && type === 'string' && g_type !== 'string')
         || (alreadyOps && type === 'number' && g_type === 'string'))
          return error('D', 'Only the addition operator is allowed for strings', passed);

        // If a 'void' function or an instruction was used...
        // (Because g_type is defined we know that some operations already occured
        // before)
        if((g_type === 'void' || (alreadyOps && type === 'void'))
        || (g_type === 'inst' || (alreadyOps && type === 'inst')))
          return error('S', 'Can\'t do operations on instructions', passed);

        // If no global type was defined - if that's not a number
        if(!g_type || g_type === 'number') {
          // Define it
          g_type = type;
          // If needed, define the expression as static
          if(staticTypes.includes(g_type))
            staticType = g_type;
        } else if(g_type)
          // Here know a type was set up. If the part's type doesn't match with
          // the global expression's one...
          // BUT the numbers are allowed ! You can add a number to a list, for
          // example, or multiply it by another
          if(g_type !== type && g_type !== 'number' && type !== 'number')
            return error('T', 'Expecting for a "${g_type}" value, "${type}" given', { g_type, type }, passed);

        // Static types doesn't support any kind of operation
        if(staticType && alreadyOps)
          return error('S', 'Static type "${g_type}" does not support any operation', { g_type }, staticType === type ? i : passed);

        // Indicates that an operation occured
        alreadyOps = true;
        // Clear all variables
        buff = '';
        op = '';
        passed = 0;
        p_type = '';
        p_ends = false;
        // Continue the loop
        continue ;
      } else if(composed_op) // If expecting a new part of an operator...
        // EXPL: Here the operator is set, so it must be a composed operator !
        return error('S', 'Expecting for the second part of a composed operator ${op}', { op: op + op });
      else if(p_ends) // An operator is needed after any content
        // EXPL: The type is declared after a content is finished (like a number)
        return error('S', 'An operator is expected after any value');

      // Opening parenthesis (used for expressions and functions call)
      if(char === '(') {
        // The sub-expression buffer
        let _buff = '';
        // The number of opened parenthesis
        let openedP = 1;
        // Was a quote opened ?
        let openedQuote = false;
        // The current column index
        // It's a kind of backup because we'll override it soon
        let org = i;
        // The called function (if there is one)
        let called = buff;
        // The called function's content (functions[called])
        let func = null;

        // If the function's name is not valid...
        if(called) {
          // If the name is not valid...
          if(!called.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/))
            return error('S', 'Can\'t put content before parenthesis');
          else
            // If that's a known functions...
            if(!functions.hasOwnProperty(called))
              return error('R', 'Function "${buff}" is not defined', { buff }, passed);

          // Get the called function
          func = functions[called];
        }

        // While the matching closing parenthesis is not reached...
        while((char !== ')' || openedP || openedQuote) && (i < expr.length)) {
          // Increase the column index
          i ++;

          // Set the current character
          char = expr.charAt(i);

          // Append the current char to the buffer
          _buff += char;

          // Quote
          if(char === '"') {
            // If there was an opened quote
            if(openedQuote)
              // Mark it as closed
              openedQuote = false;
            else
              // Indicates that a quote was opened
              openedQuote = true;
          }

          // If a quote is opened, ignore everything else
          if(openedQuote)
            continue ;

          // Opening parenthesis
          if(char === '(')
            // Increase the opened parenthesis counter
            openedP ++;

          // Closing parenthesis
          if(char === ')')
            // Decrease the opened parenthesis counter
            openedP --;
        }

        // If no parenthesis was encountered...
        if(char !== ')')
          // NOTE: Here we put the cursor to the beginning of the not-closed
          //       string
          return error('S', 'This parenthesis was not closed', i - org);

        // Remove the string's last character (it's the closing parenthesis)
        _buff = _buff.substr(0, _buff.length - 1);

        // If no function was called and the buffer is empty, that's not a valid
        // syntax (e.g. "3 * ()" is invalid)
        if(!_buff.trim() && !called)
          return error('S', 'Missing content between parenthesis');

        // Define the position at the content's beginning
        let begins = i - org - 1;

        // Was the formatting changed ?
        let changedFormatting = false;

        // Parse it
        let parse = this.parse(_buff, vars, aliases, functions, called ? ',' : '', unnativeCatcher);

        // Catch parse errors
        if(parse.failed)
          return error(parse.parse_type, parse.parse_message, parse.parse_errvars, begins - parse.column);

        // If a function was called...
        if(called) {
          // The expression was parsed using the comma separator
          // Now we'll check if the call is valid.

          // If arguments are missing...
          if(parse.length < func.length - 1)
            return error('A', 'Missing ${num} argument(s) for function "${called}"', { num: func.length - parse.length - 1, called }, begins);
          // If there are too many arguments...
          if(parse.length >= func.length) {
            // Show a different error message if the function doesn't requires any
            // argument
            if(func.length === 1)
              return error('A', 'Function "${called}" doesn\'t requires any argument', { called }, begins);
            else
              return error('A', 'Function "${called}" needs ${needs} argument(s), ${supplied} supplied', { called, needs: func.length - 1, supplied: parse.length }, begins);
          }

          // Check all arguments
          // For each argument...
          for(let i = 0; i < parse.length; i++) {
            // If the given argument doesn't match with the expected type...
            if(!this.match(parse[i].plain, func[i + 1], vars, functions, parse[i]))
              return error('T', 'Expecting a "${expected}", "${given}" given', { expected: func[i + 1], given: parse[i].type }, begins - parse[i].fromStartWithoutSpaces);
          }

          if(!UBL.functions.hasOwnProperty(called)) {
            // If this function is not a native one...
            // We first call event catcher (if specified)
            if(unnativeCatcher) {
              /** Content returned by the catcher
                * @type {object|string} */
              let ret = unnativeCatcher(error, called, parse);

              // If an error was returned...
              if(ret && ret.failed)
                // Throw it
                return ret;

              // Consider it
              // Update the formatted buffer by replacing the function's call
              // and its arguments by the returned content (if a content was
              // specified)
              if(typeof ret !== 'undefined') {
                formatted = formatted.replace(/[a-zA-Z0-9_]+ *\($/, '') + ret;
                changedFormatting = true;
              }
            } else // If no catcher was specified...
              // Register this call into the 'unnative' list
              unnative.push({ name: called, args: parse });
          }
        }

        // If the formatting was not changed by the previous block...
        if(!changedFormatting)
          // Update the formatted buffer
          formatted += parse.formatted + ')';

        // Register the unnative calls between parenthesis
        unnative = unnative.concat(parse.unnativeCalls);

        // Define the type of the part
        p_type = called ? functions[called][0] : parse.type;
        // Mark it as finished
        p_ends = true;
        // Reset the buffer
        buff = '';
        // Update the content buffer
        if(separator)
          content += _buff + ')';
        // Increase the 'passed' counter
        passed += _buff.length + 2;
        // Continue the loop
        continue ;
      }

      // Put the character into the buffer
      buff += char;
      // Increase the 'passed' counter
      passed ++;
    }

    // SUCCESS !
    // Return the result
    return buildReturn();
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
    sub: ['string', 'string', 'number', 'number'],
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
