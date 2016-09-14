
UnderBasic v0.8
- Added auto-completion
- Improved libraries
- Added french documentation (/doc/fr.html)
- Improved documentation
- Fixed: Bug when closing an undefined block (ex: using of for() without importing "alias")
- Fixed: Compiler was returning nothing for some errors
- Fixed: When importing library / including a file, multi-lines comments were not considered

UnderBasic v0.7
- Improved libraries
- Added documentation page (/doc)
- Fixed: Bugs with arguments when checking type
- Fixed: Bug with syntax highlighting for output code (trying to parse an object)
- Fixed: MAJOR bugs with lists

UnderBasic v0.6
- Improved libraries
- Added support for aliases
- Added blocks support
- Added syntax highlighting
- Added #set directive (useful for undefined arguments)
- Added #script---#endscript directive for running JavaScript plugins from library functions (allowed only in includes files)
- Added support for return instruction
- Added support for functions call on variables assignements
- Added support for blocks into other blocks
- Minor: Improved translation function
- Minor: Added support for matrix indexes ( "[A][1,5]" => "[A](1,5)" )
- Minor: Added support for multiple lines comments
- Fixed: Support of quotes : aliases are not working between quotes anymore
- Fixed: When failed to compile, auto-save was destroyed [on page's loading]
- Fixed: Syntax error with mathematical operations that includes some variables, lists or matrix
- Fixed: Bugs with arguments which contains operators ("+"...) : e.g. : Disp "Splitten : " + Str1 -> Disp "Splitten :"
