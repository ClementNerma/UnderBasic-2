"use strict";

/**
  * Handler for files clicking
  * @returns {void}
  */
function filesClickEvent() {
  $('#files div.file').click(() => {
    let fileName = $(this).text();

    if(fileName === currentFile)
      return ;

    files[currentFile] = editor.getValue();
    currentFile    = fileName;
    editor.setValue(files[currentFile]);
  });
}

/**
  * Split sentences into multiples lines due to their long length
  * @param {string} sentence
  * @param {number} width Maximum width of a line
  * @returns {string}
  */
function splitLines(sentence, width) {
  let lines = sentence.split(/\r\n|\r|\n/);

  if(lines.length > 1) {
    for(let i = 0; i < lines.length; i++)
      lines[i] = splitLines(lines[i], width);

    return lines.join('\n');
  }

  let rows = [];
  let arr = sentence.split(' ');
  let currow = arr[0];
  let rowlen = currow.length;

  for(let i = 1; i < arr.length; i++) {
    let word = arr[i];
    rowlen += word.length + 1;

    if(rowlen <= width)
      currow += " " + word;
    else {
      rows.push(currow);
      currow = word;
      rowlen = word.length;
    }
  }

  rows.push(currow);
  return rows.join('\n');
}

// Is the local storage supported on this browser ?
let localStorageSupport = (typeof localStorage !== 'undefined'),
  autoSaved,
  currentFile = 'main',
  files = {
    main: ''
  },
  last_code = '';

let editor = CodeMirror($('#editor').get(0), {
  styleActiveLine: true,
  lineNumbers: true,
  indentUnit: 2,
  mode: 'underbasic'
});

let result = CodeMirror($('#result').get(0), {
  styleActiveLine: true,
  lineNumbers: true,
  indentUnit: 2,
  mode: 'underbasic'
});

editor.on('change', (codemirror, change) => {
  let code = codemirror.getValue();

  if(code === last_code)
    return ;

  last_code = code;

  if(localStorageSupport) {
    files[currentFile] = code;
    localStorage.setItem('__underbasic_autosave', JSON.stringify(files));
    localStorage.setItem('__underbasic_current_file', currentFile);
  }

  let comp = UnderBasic.compile(code, files), mode = comp.failed ? 'text' : 'underbasic';

  $('#result').css('border-color', comp.failed ? 'red' : 'lightgray');

  if(result.options.mode !== mode)
    result.setOption('mode', mode);

  result.setValue(
    // Error output
    comp.failed ?
      // Split the message by lines with a maximum width
      splitLines(comp.content, Math.floor((document.getElementById('result').clientWidth || 459) / 7.65)) :
      // Normal output :
      // Display as it
      comp.content
  );

  // console.log(comp);
});

if(localStorageSupport && (autoSaved = localStorage.getItem('__underbasic_autosave'))) {
  let conf;

  try {
    files = JSON.parse(autoSaved);
    currentFile = localStorage.getItem('__underbasic_current_file') || 'main';

    console.info('Auto-saved content has been restored, current file is "' + currentFile + '"');
  }

  catch(e) {
    alert('Unable to recover last auto-save. Auto-save will be erased and page will be refreshed');
    localStorage.removeItem('__underbasic_autosave');
    localStorage.removeItem('__underbasic_current_file');
    window.location.reload();
  }

  for(let i in files)
    if(files.hasOwnProperty(i))
      $('#files').append($(document.createElement('div')).text(i).attr('name', i).addClass('file').addClass(currentFile === i ? 'active' : ''));

  editor.setValue(files[currentFile]);
} else {
  if(localStorageSupport) {
    try {
      localStorage.setItem('__underbasic_autosave', JSON.stringify(files));
      localStorage.setItem('__underbasic_current_file', currentFile);
    }

    catch(e) {
      alert('Unable to save configuration. You might have the following message the next time you will launch this page :\n"Unable to recover last auto-save"\nDon\'t be worry if you see it.')
    }
  }

  $('#files').append('<div class="file active">main</div>');
}

$('#addFile').on('click', () => {
  let name = prompt('Please input the file name :');

  if(files.hasOwnProperty(name))
    return alert('This file already exists !');

  files[name] = '';

  $('#files').append($(document.createElement('div')).addClass('file').text(name).attr('name', name));
  filesClickEvent();
  $('#files [name="' + name + '"]').click();

  editor.focus();

});

$('#deleteFile').on('click', () => {
  let name = prompt('Please input the file name :');

  if(name === 'main')
    return alert('You can\'t delete the "main" file !');

  if(!files.hasOwnProperty(name))
    return alert('This file doesn\'t exists !');

  $('#files [name="main"]').click();
  $('#files [name="' + name + '"]').remove();
  delete files[name];
});

let match, req;

if(match = window.location.search.match(/^\?sample=([a-zA-Z0-9_]+)$/)) {
  req = $.ajax({
    url  : 'samples/' + match[1] + '.ubs',
    async: false
  });

  if(req.status !== 200)
    alert('Failed to load sample : "' + match[1] + '"');
  else
    editor.setValue(req.responseText);
}

filesClickEvent();

editor.focus();
