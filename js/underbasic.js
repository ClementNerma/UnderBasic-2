"use strict";

/**
  * UnderBasic interface
  * @type {UnderBasic}
  */
const UnderBasic = (new (function() {

  /**
    * Compile a source code
    * @param {string} code
    * @returns {object}
    */
  this.compile = (code) => { return { failed: true, content: 'Compiler is not made !' }; };

})());
