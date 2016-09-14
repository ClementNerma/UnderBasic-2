"use strict";

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
    * Compile a source code
    * @param {string} code
    * @returns {object}
    */
  this.compile = (code) => { return { failed: true, content: 'Compiler is not made !' }; };

})());
