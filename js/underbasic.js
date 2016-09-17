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
      column: column,
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
    * @returns {boolean} working
    */
  this.match = (content, parent, variables) => {
    // Case of an optionnal content...
    if(parent.startsWith('[') && parent.endsWith(']')) {
      // If no content was provided...
      if(!content)
        // Success !
        return true;

      // ELse, make it a normal type
      parent = parent.substr(1, parent.length - 2);
    }

    // Get type
    let type = this.getVarType(content, true, variables);
    // If a type was found...
    if(type) // We know that the content is a pointer
      return (parent.endsWith('*') ? type === parent.substr(0, parent.length - 1) : type === parent);

    // Now we know that's not a pointer, so, if the expected type is a pointer...
    if(parent.endsWith('*'))
      // Return false
      return false;

    // Get the type
    type = this.getType(content, true, variables, true);

    // If a type was found...
    if(typeof type === 'string')
      // Check if it matches
      return type === parent;

    // If the given variables is an expression object...
    if(variables)
      // Check the type
      return !variables.failed && variables.type === parent;

    // Parse the content
    let parse = this.parse(content);
    // If an error occured...
    if(parse.failed)
      // Failed !
      return false;

    // Here we have a successfully parsed content, we check its type...
    return (parse.type === parent);
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
      if(char === ' ') {
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
      * @returns {string} str
      */
    function rmspace(str) {
      return str.replace(/([^"]+)|("[^"]+")/g, ($0, $1, $2) => $1 ? $1.replace(/\s/g, '') : $2);
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
      let cursor = obj.column < errorWidth ? obj.column : errorWidth;
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
    let variables = { theta: 'number', e: 'number', pi: 'number', n: 'number', i: 'number' };
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
      if(match = line.match(/^([a-zA-Z]+)( +)([a-zA-Z0-9_]+)$/)) {
        // If this variable was already defined...
        if(variables.hasOwnProperty(match[3]))
          return error('Variable "${name}" is already defined', { name: match[3] }, match[1].length + match[2].length);

        // If that's a function's name...
        if(functions.hasOwnProperty(match[3]))
          return error('Name "${name}" is already used for a function', { name: match[3] }, match[1].length + match[2].length);

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
        output.push(format(rmspace(match[6])) + '->' + aliases[match[1]]);
      }
      // 'Return' instruction
      else if(line === 'exit')
        output.push('Return');
      // 'Stop' instruction
      else if(line === 'stop')
        output.push('Stop');
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

  /**
    * Parse an expression
    * @param {string} expr
    * @param {boolean} [extended]
    * @param {object} [variables]
    * @returns {object} parsed
    */
  this.parse = (expr, extended = false, variables = {}, numExp, strExp, fullExpr, startI) => {
    // This function is derived from the Expression.js library which doesn't
    // have a code documentation.

    function _e(msg, add = 0) {
      return _error(msg, i + (startI - 2 || -1) + 1 + add);
    }

    // Integer buffer
    let buffInt = '';
    // Decimal buffer
    let buffDec= '';
    // Is it a floating value ?
    let floating = false;
    // Current operator
    let operator = '';
    // Letters buffer, used for variables name
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
    // ???
    let p_buff = '';
    // ???
    let p_count = 0;
    // The function that is currently called
    let functionCall;
    // The arguments of the currently called function
    let callfunc;
    // ???
    let functionIndex = 0;
    // Arguments given to the called function
    let callBuffs = [];
    // ???
    let j;
    // Is there a string opened ?
    let stringOpened = false;
    // ???
    let functionColumn;
    // The static type of the expression
    let staticType;

    

    expr += '+';

    for(char of expr) {
      i++;

      if(char === '(') {
        if(p_count) {
          p_count += 1;
          p_buff  += '(';
          continue ;
        }

        if(buffInt || buffDec)
          return _e('Opening parenthesis just after a number');

        if(buffString)
          return _e('Opening parenthesis just after a string');

        if(buffLetter) {
          if(!UBL.functions.hasOwnProperty(buffLetter))
            return _e('Unknown function "' + buffLetter + '"', -buffLetter.length - 1);

          if(UBL.functions[buffLetter][0] === 'string' && numExp)
            return _e('Strings are not allowed in numeric expressions', bl);

          if(UBL.functions[buffLetter][0] === 'number' && strExp)
            return _e('Numbers are not allowed in string expressions', bl);

          functionCall   = buffLetter;
          functionColumn = i;
          callfunc       = UBL.functions[buffLetter].slice(1);
          functionIndex  = p_count + 1;
        }

        if(!p_count)
          p_buff = '';

        p_count += 1;

        if(p_count === 1)
          continue ;
      } else if(char === ')') {
        if(functionCall && p_count === functionIndex) {
          if(p_buff) // Fix a bug when script calls a function without any argument
            callBuffs.push(p_buff);

          let col = functionColumn, index = 0;

          // If some arguments are missing and the missing ones are not
          // optionnals...
          if(callBuffs.length < callfunc.length && !callfunc[callBuffs.length].startsWith('['))
            return _e('Missing ' + (callfunc.length - callBuffs.length) + ' arguments', -1 /* strangely the -1 is needed here... bug ? */);

          // For each argument given...
          for(let buff of callBuffs) {
            get = this.parse(buff.trim(), extended, variables, undefined, undefined, expr, col);
            index ++;

            // If failed to parse the content
            if(get.failed)
              return get;

            // If that's not the type we expect for...
            if(!this.match(buff.trim(), callfunc[index - 1], get))
              return _e('Argument ' + index + ' must be a ' + callfunc[index - 1] + ', ' + get.type + ' given', col - i + (buff.match(/^ +/) || [''])[0].length);

            col += buff.length + 1;
          }

          // Add a new part
          parts.push({ function: functionCall, arguments: callBuffs });
          // Reset variables
          functionCall = null;
          buffInt      = '$' + (++$);
          buffLetter   = '';
          floating     = false;
          p_count     -= 1;
          continue ;
        }

        if(!p_count)
          return _e('No parenthesis is opened');

        p_count -= 1;

        if(!p_count) {
          if(p_buff) {
            // parse content
            get = this.parse(p_buff, extended, variables, numExp, strExp, expr, i - p_buff.length);

            if(get.failed)
              return get;

            if(get.numbers.length === 1 && !get.numbers[0].startsWith('$'))
              // Optimization
              buffInt = get.numbers[0];
            else {
              buffInt = '$' + (++$);
              parts.push(!get.parts.length ? get.numbers : get);
            }

            continue ;
          } else
            return _e('No content between parenthesis', -2);
        }
      } else if(functionCall && char === ',') {
        // If there is already the same number of arguments in the call and in
        // the function's declaration... (in fact we're checking for the right
        // number of arguments LESS 1, because there is still one argument
        // after the ',' separator)
        if(callBuffs.length === callfunc.length - 1)
          return _e('Too many arguments, function "' + functionCall + '" needs only ' + callfunc.length + ' arguments', -1);

        callBuffs.push(p_buff);
        p_buff = '';
        continue ;
      }

      if(p_count) {
        p_buff += char;
        continue ;
      }

      if(char === '"' && stringOpened) {
        stringOpened = false;
        buffString  += '"';
        continue ;
      }

      if(stringOpened) {
        buffString += char;
        continue ;
      }

      if(char === ' ') {
        if(functionCall)
          p_buff += ' ';

        continue ;
      }

      if('+-*/'.indexOf(char) !== -1) {
        // It's an operator
        // Here is the buffer
        let buff = buffInt || buffLetter || buffString;
        // Position at the buffer's beginning
        let bl = - /* negative value */ (buff.length + 1 /* we're at the operator char, next to the buffer */);

        // If that's the last operator and no value was given...
        if(i === expr.length && !buff)
          return _e('Missing something here', -2);

        // If that's not the last operator and the type is static...
        if(i === expr.length && staticType)
          return _e('Type "' + staticType + '" is a static type, operations are not supported');

        if(!buff)
          return _e('Missing number before operator', bl);

        if(floating && !buffDec)
          return _e('Missing decimal part of floating number', bl);

        if(strExp && char !== '+')
          return _e('Only the "+" operator is allowed in string expressions', bl);

        if(operator === '+' || operator === '-' || !operator)
          numbers.push(buffString || buffLetter || (!floating ? buffInt : buffInt + '.' + buffDec));
        else { // operator === '*' || operator === '/'
          parts.push(numbers.splice(numbers.length - 2, 2).concat(buffString || buffLetter || (!floating ? buffInt : buffInt + '.' + buffDec)));
          numbers.push('$' + (++$));
        }

        // The last item
        let item = numbers[numbers.length - 1], type = UnderBasic.getType(item, extended, variables);

        // If that's not a sub-expression
        if(!item.startsWith('$')) {
          // Check types
          if(typeof type === 'object')
            return _e(type.content, bl);

          switch(type) {
            // Some types are checked again here because this function doesn't care about "A" or "Str1"

            case 'number':
              if(strExp)
                return _e('Numbers are not allowed in string expressions', bl);

              numExp = true;
              break;

            case 'string':
            case 'yvar':
              if(strExp === false)
                return _e('Strings are not allowed in numeric expressions', bl);

              strExp = true;
              break;

            case 'list':
            case 'matrix':
            case 'picture':
            case 'gdb':
            case 'program':
            case 'appvar':
            case 'group':
            case 'application':
              if(numbers.length > 1)
                return _e('Type "' + type + '" is a static type and doesn\'t support operations');

              staticType = type;
              break;
          }
        }

        numbers.push(char);
        operator = char;

        // Reset current number
        buffInt    = '';
        buffDec    = '';
        buffLetter = '';
        buffString = '';
        floating   = false;
      } else if('0123456789'.indexOf(char) !== -1) {
        if(buffLetter)
          buffLetter += char;
        else if(strExp)
          return _e('Can\'t put a number into a string expression');
        else if(!floating)
          buffInt += char;
        else
          buffDec += char;
      } else if(char === '.') {
        if(floating)
          return _e('Can\'t use two times the "." symbol in a number');

        if(buffString)
          return _e('Can\'t use the "." symbol after a string');

        if(buffLetter)
          return _e('Can\'t use the "." symbol after a name');

        if(!buffInt)
          buffInt = '0';

        floating = true;
      } else if(char.match(/[a-zA-Z_]/))
        buffLetter += char;
      else if(char === '"') {
        if(numExp)
          return _e('Can\'t put a string into a numeric expression');

        stringOpened = true;
        buffString   = '"';

        continue ;
      } else
        return _e('Syntax error : Unknown symbol');
    }

    if(p_count)
      return _e(p_count + ' parenthesis not closed');

    numbers.push(!floating ? buffInt : buffInt + '.' + buffDec);

    let ret = { numbers: numbers.slice(0, numbers.length - 2), parts };
    if(strExp)
      ret.type = 'string';
    else if(staticType)
      ret.type = staticType;
    else
      ret.type = 'number';

    if(buffInt || buffDec || buffString || buffLetter)
      return _e('Syntax error', -(buffInt || buffDec || buffString || buffLetter).length)

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
    Asm: ['void', 'program'],
    AsmComp: ['void', 'program', 'program'],
    augment: ['matrix', 'matrix', 'matrix'],
    bal: ['number', 'number', '[number]'],
    binomcdf: ['number', 'number', 'number', '[number]'],
    binompdf: ['number', 'number', 'number', '[number]'],
    Circle: ['void', 'number', 'number', 'number'],
    conj: ['number', 'number'],
    cos: ['number', 'number'],
    arccos: ['number', 'number'],
    cosh: ['number', 'number'],
    arccosh: ['number', 'number'],
    cumSum: ['matrix', 'list'],
    det: ['number', 'matrix'],
    dim: ['number', 'list'],
    "e^": ['number', 'number'],
    "Equ>String": ['void', 'yvar*', 'string*'],
    expr: ['number', 'string'],
    Fcdf: ['number', 'number', 'number', 'number', 'number'],
    fMax: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    fMin: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    fnInt: ['number', 'expression', 'number', 'number', 'number', '[number]'],
    For: ['void', 'number*', 'number', 'number'],
    fPart: ['number', 'number'],
    Fpdf: ['number', 'number', 'number', 'number'],
    gcd: ['number', 'number', 'number'],
    geometcdf: ['number', 'number', 'number'],
    geometpdf: ['number', 'number', 'number'],
    Get: ['void', 'mixed*'],
    GetCalc: ['void', 'mixed*'],
    getDate: ['list'],
    getTime: ['list'],
    getKey: ['number'],
    identity: ['matrix', 'number'],
    imag: ['number', 'number'],
    inString: ['number', 'string', 'string'],
    int: ['number', 'number'],
    EInt: ['number', 'number', 'number', '[number]'],
    invNorm: ['number', 'number', '[number]', '[number]'],
    iPart: ['number', 'number'],
    isClockOn: ['bool'],
    lcm: ['number', 'number', 'number'],
    length: ['number', 'string'],
    Line: ['void', 'number', 'number', 'number', 'number', '[0]'],
    "^List": ['list', 'list'],
    "List>matr": ['void', 'list*', 'matrix*'],
    ln: ['number', 'number'],
    log: ['number', 'number'],
    "Matr>List": ['void', 'matrix', 'list*'],
    max: ['number', 'number', 'number'],
    mean: ['number', 'list', '[list]'],
    median: ['number', 'list', '[list]'],
    min: ['number', 'number', 'number'],
    normalcdf: ['number', 'number', 'number', '[number]', '[number]'],
    normalpdf: ['number', 'number', '[number]', '[number]'],
    not: ['number', 'number'],
    Output: ['void', 'number', 'number', 'string'],
    poissoncdf: ['number', 'number', 'number'],
    poissonpdf: ['number', 'number', 'number'],
    prod: ['number', 'list', 'number', 'number'],
    "Pt-Change": ['void', 'number', 'number'],
    "Pt-Off": ['void', 'number', 'number', '[number]'],
    "Pt-On": ['void', 'number', 'number', '[number]'],
    "Pxl-Change": ['void', 'number', 'number'],
    "Pxl-Off": ['void', 'number', 'number'],
    "Pxl-On": ['void', 'number', 'number'],
    "pxl-Test": ['number', 'number', 'number'],
    "P>Rx": ['number', 'number', 'number'],
    "P>Ry": ['number', 'number', 'number'],
    randBin: ['number', 'number', 'number', '[number]'],
    randInt: ['number', 'number', 'number', '[number]'],
    randM: ['matrix', 'number', 'number'],
    randNom: ['number', 'number', 'number', '[number]'],
    real: ['number', 'number'],
    ref: ['matrix', 'matrix'],
    round: ['number', 'number', '[number]'],
    "*row": ['matrix', 'number', 'matrix', 'number'],
    "row+": ['matrix', 'matrix', 'number', 'number'],
    "*row+": ['matrix', 'number', 'matrix', 'number', 'number'],
    rowSwap: ['matrix', 'matrix', 'number', 'number'],
    rref: ['matrix', 'matrix'],
    "R>Pr": ['number', 'number', 'number'],
    Send: ['void', 'mixed*'],
    Shade: ['void', 'expression', 'expression', '[number]', '[number]', '[number]', '[number]'],
    "ShadeX²": ['void', 'number', 'number', 'number'],
    ShadeF: ['void', 'number', 'number', 'number', 'number'],
    ShadeNorm: ['void', 'number', 'number', '[number]', '[number]'],
    Shade_t: ['void', 'number', 'number', 'number'],
    sin: ['number', 'number'],
    arcsin: ['number', 'number'],
    sinh: ['number', 'number'],
    arcsinh: ['number', 'number'],
    SortA: ['void', 'list*'],
    SortD: ['void', 'list*'],
    stdDev: ['number', 'list', '[list]'],
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
    tpdf: ['number', 'number', 'number'],
    variance: ['list', 'list', 'list']
  };

  UBL.statements = {
    Archive: ['program'],
    AsmPrgm: [],
    "AUTO Answer": [],
    AxesOff: [],
    AxesOn: [],
    "a+bi": [],
    Boxplot: [],
    CLASSIC: [],
    "Clear Entries": [],
    ClockOff: [],
    ClockOn: [],
    ClrList: ['list*'],
    ClrAllLists: [],
    ClrTable: [],
    Connected: [],
    CoordOff: [],
    CoordOn: [],
    "DEC Answer": [],
    Degree: [],
    DelVar: ['mixed*'],
    DependAsk: [],
    DependAuto: [],
    DiagnosticOff: [],
    DiagnosticOn: [],
    Disp: ['mixed'],
    DispGraph: [],
    DispTable: [],
    Dot: [],
    DrawF: ['expression'],
    DrawInv: ['expression'],
    Eng: [],
    ExprOff: [],
    ExprOn: [],
    ">F<>D": [],
    Fix: ['number'],
    Float: [],
    "FRAC Answer": [],
    Full: [],
    Func: [],
    GarbageCollect: [],
    Goto: ['label'],
    GridOff: [],
    GridOn: [],
    "G-T": [],
    Histogram: [],
    Horiz: [],
    Horizontal: ['number'],
    IndpntAsk: [],
    IndpntAuto: [],
    Input: ['string*', '[string]'],
    LabelOff: [],
    LabelOn: [],
    LnReg: [],
    MATHPRINT: [],
    ModBoxplot: [],
    "n/d": [],
    ">n/d<>Un/d": [],
    Normal: [],
    NormProbPlot: [],
    Param: [],
    Pause: ['[string]'],
    Pmt_Bgn: [],
    Pmt_End: [],
    Polar: [],
    PolarGC: [],
    Prompt: ['number*'],
    Radian: [],
    Real: [],
    RecallGDB: ['number'],
    RecallPic: ['number'],
    RectGC: [],
    Return: [],
    Scatter: [],
    Sci: [],
    Seq: [],
    Sequential: [],
    SetUpEditor: ['list*'],
    Simul: [],
    Stop: [],
    StoreGDB: ['number'],
    StorePic: ['number'],
    Time: [],
    Trace: [],
    UnArchive: ['mixed*'],
    "Un/d": [],
    uvAxes: [],
    uwAxes: [],
    "1-Var Stats": ['list*', 'list*'],
    "2-Var Stats": ['list*', 'list*'],
    Vertical: ['number'],
    vwAxes: [],
    Web: [],
    xyLine: [],
    ZBox: [],
    ZDecimal: [],
    "ZFrac1/2": [],
    "ZFrac1/3": [],
    "ZFrac1/4": [],
    "ZFrac1/5": [],
    "ZFrac1/8": [],
    "ZFrac1/10": [],
    ZInteger: [],
    "Zoom In": [],
    "Zoom Out": [],
    ZoomFit: [],
    ZoomRcl: [],
    ZoomStat: [],
    ZoomSto: [],
    ZPrevious: [],
    ZSquare: [],
    ZStandard: [],
    ZTrig: []
  };

  // Keywords
  UBL.keywords = UBL.allTypes;
  UBL.builtins = Reflect.ownKeys(UBL.functions).concat(Reflect.ownKeys(UBL.statements));

})());
