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
    if(parsed.strExp)
      return 'string';
    else
      return 'number';
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
    let variables = {};
    // Aliases (linked to variables)
    let aliases = {};
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
        aliases[match[3]] = alias;
      }
      // If that's an assignment...
      else if(match = line.match(/^([a-zA-Z0-9_]+)( *)=( *)(.*)$/)) {
        // If the assigned variable is not defined...
        if(!variables.hasOwnProperty(match[1]))
          return error('Variable "${name}" is not defined', { name: match[1] });

        // The variable's type
        let type = this.getType(match[4], null, variables);

        // If this type is not known...
        if(typeof type === 'object')
          return formatError(type, match[1].length + match[2].length + match[3].length + 1);

        // If that's not the same type as the variable...
        if(type !== variables[match[1]])
          return error('Type mismatch : attempting to assign content type "${type}" in a variable of type "${type2}"', { type, type2: variables[match[1]] }, match[1].length + match[2].length + match[3].length + 1);

        // Output
        output.push(rmspace(match[4]) + '->' + format(match[1]));
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

  /**
    * Parse an expression
    * @param {string} expr
    * @param {boolean} [extended]
    * @param {object} [variables]
    * @param {boolean} [strict] If set to true, will not allow empty integer parts (e.g. ".5"). Default: false
    * @returns {object} parsed
    */
  this.parse = (expr, extended = false, variables = {}, strict, numExp, strExp, fullExpr, startI) => {
    // This function is derived from the Expression.js library which doesn't
    // have a code documentation.

    function _e(msg, add = 0) {
      return _error(msg, i + (startI || -1) + 1 + add);
    }

    let buffInt = '', buffDec = '', floating = false, operator = '', numbers = [], $ = -1, get, parts = [];
    let char, p_buff = '', p_count = 0, buffLetter = '', functionCall = null, functionIndex = 0, callBuffs = [], j,
        buffString = '', stringOpened = false, i = 0;

    expr += '+';

    for(let char of expr) {
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
          functionCall  = buffLetter;
          functionIndex = p_count + 1;
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

          let i = 0;

          for(let buff of callBuffs) {
            get = this.parse(buff, extended, variables, strict, undefined, undefined, expr, ++i - p_buff.length);

            if(get.failed)
              return get;

            if(get.numbers.length === 1 && !get.numbers[0].startsWith('$'))
              // Optimization
              buff = get.numbers[0];
            else {
              buff = '$' + (++$);
              parts.push(!get.parts.length ? get.numbers : get);
            }
          }

          parts.push({ function: functionCall, arguments: callBuffs });
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
            get = this.parse(p_buff, extended, variables, strict, numExp, strExp, expr, i - p_buff.length);

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
          } else if(strict)
            return _e('No content between parenthesis');
          else {
            buffInt    = '0';
            /*buffLetter = '';
            buffString = '"';*/
            floating   = false;
          }
        }
      } else if(functionCall && char === ',') {
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

      if(char === ' ')
        continue ;

      if('+-*/'.indexOf(char) !== -1) {
        // It's an operator
        // Here is the buffer
        let buff = buffInt || buffLetter || buffString;

        if(!buff)
          return _e('Missing number before operator', -buff.length);

        if(floating && !buffDec)
          return _e('Missing decimal part of floating number', -buff.length);

        if(strExp && char !== '+')
          return _e('Only the "+" operator is allowed in string expressions', -buff.length);

        if(operator === '+' || operator === '-' || !operator)
          numbers.push(buffString || buffLetter || (!floating ? buffInt : buffInt + '.' + buffDec));
        else { // operator === '*' || operator === '/'
          parts.push(numbers.splice(numbers.length - 2, 2).concat(buffString || buffLetter || (!floating ? buffInt : buffInt + '.' + buffDec)));
          numbers.push('$' + (++$));
        }

        // The last item
        let item = numbers[numbers.length - 1], type = UnderBasic.getType(item, extended, variables);

        // Check types
        if(typeof type === 'object')
          return _e('Unknown content type', -buff.length);

        // If that's not a sub-expression
        if(!item.startsWith('$')) {
          switch(type) {
            // Some types are checked again here because this function doesn't care about "A" or "Str1"

            case 'number':
              if(strExp)
                return _e('Numbers are not allowed in string expressions', -buff.length);

              strExp = false;
              break;

            case 'string':
            case 'yvar':
              if(strExp !== undefined && !strExp)
                return _e('Strings are not allowed in numeric expressions', -buff.length);

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
              return _e('Type ' + type + ' is forbidden in expressions', -buff.length);
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

        if(!buffInt) {
          if(strict)
            return _e('Missing integer part');

          buffInt = '0';
        }

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

    let ret = {numbers: numbers.slice(0, numbers.length - 2), parts: parts};
    if(strExp) ret.strExp = true;

    return ret;
  };

  // Export data into the library
  UBL = {
    types, short_types, extended_types, short_extended_types,
    allTypes: types.concat(short_types).concat(extended_types).concat(short_extended_types)
  };

})());
