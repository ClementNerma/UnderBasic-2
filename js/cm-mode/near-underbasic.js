// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  function wordRegexp(words) {
    return new RegExp("^((" + words.join('||').replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&").split('\\|\\|').join(')|(') + "))\\b");
  }

  let wordOperators  = wordRegexp(["and", "or", "not", "is"]);

  let commonKeywords = UBL.keywords;
  let commonBuiltins = UBL.builtins;

  CodeMirror.registerHelper("hintWords", "underbasic", commonKeywords.concat(commonBuiltins));

  function top(state) {
    return state.scopes[state.scopes.length - 1];
  }

  CodeMirror.defineMode("underbasic", function(conf/*, parserConf*/) {
    let ERRORCLASS = "error";

    let singleDelimiters = /^[\(\)\[\]\{\}@,:`=;\.]/;
    let doubleOperators = /^([!<>]==|<>|<<|>>|\/\/|\*\*)/;
    let doubleDelimiters = /^(\+=|\-=|\*=|%=|\/=|&=|\|=|\^=)/;
    let tripleDelimiters = /^(\/\/=|>>=|<<=|\*\*=)/;

    let hangingIndent = conf.indentUnit;

    let myKeywords = commonKeywords;
    let myBuiltins = commonBuiltins;

    // since http://legacy.python.org/dev/peps/pep-0465/ @ is also an operator
    let singleOperators = /^[\+\-\*\/]/;
    let identifiers = /^[_A-Za-z\u00A1-\uFFFF][_A-Za-z0-9\u00A1-\uFFFF]*/;
    let stringPrefixes = new RegExp("^(([rbuf]|(br))?('{3}|\"{3}|['\"]))", "i");

    let native   = wordRegexp(UBL.native);
    let keywords = wordRegexp(myKeywords);
    let builtins = wordRegexp(myBuiltins);

    // tokenizers
    function tokenBase(stream, state) {
      if (stream.sol()) state.indent = stream.indentation()
      // Handle scope changes
      if (stream.sol() && top(state).type == "py") {
        let scopeOffset = top(state).offset;
        if (stream.eatSpace()) {
          let lineOffset = stream.indentation();
          if (lineOffset > scopeOffset)
            pushPyScope(state);
          else if (lineOffset < scopeOffset && dedent(stream, state))
            state.errorToken = true;
          return null;
        } else {
          let style = tokenBaseInner(stream, state);
          if (scopeOffset > 0 && dedent(stream, state))
            style += " " + ERRORCLASS;
          return style;
        }
      }
      return tokenBaseInner(stream, state);
    }

    function tokenBaseInner(stream, state) {
      if (stream.eatSpace()) return null;

      let ch = stream.peek();

      // Handle Comments
      if (ch == "#") {
        stream.skipToEnd();
        return "comment";
      }

      // Handle Number Literals
      if (stream.match(/^[0-9\.]/, false)) {
        let floatLiteral = false;
        // Floats
        if (stream.match(/^\d*\.\d+(e[\+\-]?\d+)?/i)) { floatLiteral = true; }
        if (stream.match(/^\d+\.\d*/)) { floatLiteral = true; }
        if (stream.match(/^\.\d+/)) { floatLiteral = true; }
        if (floatLiteral) {
          // Float literals may be "imaginary"
          stream.eat(/J/i);
          return "number";
        }
        // Integers
        let intLiteral = false;
        // Hex
        if (stream.match(/^0x[0-9a-f]+/i)) intLiteral = true;
        // Binary
        if (stream.match(/^0b[01]+/i)) intLiteral = true;
        // Octal
        if (stream.match(/^0o[0-7]+/i)) intLiteral = true;
        // Decimal
        if (stream.match(/^[1-9]\d*(e[\+\-]?\d+)?/)) {
          // Decimal literals may be "imaginary"
          stream.eat(/J/i);
          // TODO - Can you have imaginary longs?
          intLiteral = true;
        }
        // Zero by itself with no other piece of number.
        if (stream.match(/^0(?![\dx])/i)) intLiteral = true;
        if (intLiteral) {
          // Integer literals may be "long"
          stream.eat(/L/i);
          return "number";
        }
      }

      // Handle Strings
      if (stream.match(stringPrefixes)) {
        state.tokenize = tokenStringFactory(stream.current());
        return state.tokenize(stream, state);
      }

      // Handle operators and Delimiters
      if (stream.match(tripleDelimiters) || stream.match(doubleDelimiters))
        return "punctuation";

      if (stream.match(doubleOperators) || stream.match(singleOperators))
        return "operator";

      if (stream.match(singleDelimiters))
        return "punctuation";

      if (stream.match(keywords) || stream.match(wordOperators))
        return "keyword";

      if (stream.match(builtins))
        return "builtin";

      if (stream.match(native))
        return "variable-2";

      if (stream.match(identifiers))
        return "variable";

      // Handle non-detected items
      stream.next();
      return ERRORCLASS;
    }

    function tokenStringFactory(delimiter) {
      while ("rub".indexOf(delimiter.charAt(0).toLowerCase()) >= 0)
        delimiter = delimiter.substr(1);

      let singleline = delimiter.length == 1;
      let OUTCLASS = "string";

      function tokenString(stream, state) {
        while (!stream.eol()) {
          stream.eatWhile(/[^'"\\]/);
          if (stream.eat("\\")) {
            stream.next();
            if (singleline && stream.eol())
              return OUTCLASS;
          } else if (stream.match(delimiter)) {
            state.tokenize = tokenBase;
            return OUTCLASS;
          } else {
            stream.eat(/['"]/);
          }
        }
        if (singleline)
          state.tokenize = tokenBase;
        return OUTCLASS;
      }
      tokenString.isString = true;
      return tokenString;
    }

    function pushPyScope(state) {
      while (top(state).type != "py") state.scopes.pop()
      state.scopes.push({offset: top(state).offset + conf.indentUnit,
                         type: "py",
                         align: null})
    }

    function pushBracketScope(stream, state, type) {
      let align = stream.match(/^([\s\[\{\(]|#.*)*$/, false) ? null : stream.column() + 1
      state.scopes.push({offset: state.indent + hangingIndent,
                         type: type,
                         align: align})
    }

    function dedent(stream, state) {
      let indented = stream.indentation();
      while (top(state).offset > indented) {
        if (top(state).type != "py") return true;
        state.scopes.pop();
      }
      return top(state).offset != indented;
    }

    function tokenLexer(stream, state) {
      if (stream.sol()) state.beginningOfLine = true;

      let style = state.tokenize(stream, state);
      let current = stream.current();

      // Handle decorators
      if (state.beginningOfLine && current == "@")
        return stream.match(identifiers, false) ? "meta" : py3 ? "operator" : ERRORCLASS;

      if (/\S/.test(current)) state.beginningOfLine = false;

      if ((style == "variable" || style == "builtin")
          && state.lastToken == "meta")
        style = "meta";

      // Handle scope changes.
      if (current == "pass" || current == "return")
        state.dedent += 1;

      if (current == "lambda") state.lambda = true;
      if (current == ":" && !state.lambda && top(state).type == "py")
        pushPyScope(state);

      let delimiter_index = current.length == 1 ? "[({".indexOf(current) : -1;
      if (delimiter_index != -1)
        pushBracketScope(stream, state, "])}".slice(delimiter_index, delimiter_index+1));

      delimiter_index = "])}".indexOf(current);
      if (delimiter_index != -1) {
        if (top(state).type == current) state.indent = state.scopes.pop().offset - hangingIndent
        else return ERRORCLASS;
      }
      if (state.dedent > 0 && stream.eol() && top(state).type == "py") {
        if (state.scopes.length > 1) state.scopes.pop();
        state.dedent -= 1;
      }

      return style;
    }

    let external = {
      startState: function(basecolumn) {
        return {
          tokenize: tokenBase,
          scopes: [{offset: basecolumn || 0, type: "py", align: null}],
          indent: basecolumn || 0,
          lastToken: null,
          lambda: false,
          dedent: 0
        };
      },

      token: function(stream, state) {
        let addErr = state.errorToken;
        if (addErr) state.errorToken = false;
        let style = tokenLexer(stream, state);

        if (style && style != "comment")
          state.lastToken = (style == "keyword" || style == "punctuation") ? stream.current() : style;
        if (style == "punctuation") style = null;

        if (stream.eol() && state.lambda)
          state.lambda = false;
        return addErr ? style + " " + ERRORCLASS : style;
      },

      indent: function(state, textAfter) {
        if (state.tokenize != tokenBase)
          return state.tokenize.isString ? CodeMirror.Pass : 0;

        let scope = top(state), closing = scope.type == textAfter.charAt(0)
        if (scope.align != null)
          return scope.align - (closing ? 1 : 0)
        else
          return scope.offset - (closing ? hangingIndent : 0)
      },

      electricInput: /^\s*[\}\]\)]$/,
      closeBrackets: {triples: "'\""},
      lineComment: "#",
      fold: "indent"
    };
    return external;
  });

  CodeMirror.defineMIME("text/x-underbasic", "underbasic");

  let words = function(str) { return str.split(" "); };

  CodeMirror.defineMIME("text/x-cython", {
    name: "underbasic",
    extra_keywords: words("by cdef cimport cpdef ctypedef enum except"+
                          "extern gil include nogil property public"+
                          "readonly struct union DEF IF ELIF ELSE")
  });

});
