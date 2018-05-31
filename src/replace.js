const {
  getReplacement,
  replace,
  resolveModuleContents,
  isCodegenComment,
  isPropertyCall,
  transformAndRequire,
} = require('./helpers')

module.exports = getReplacers

function getReplacers(babel) {
  function asProgram(path, filename, parserOpts) {
    const {code} = babel.transformFromAst(path.node)
    const replacement = getReplacement({code, filename, parserOpts}, babel)
    path.node.body = Array.isArray(replacement) ? replacement : [replacement]
  }

  function asImportDeclaration(path, filename, parserOpts) {
    const codegenComment = path.node.source.leadingComments
      .find(isCodegenComment)
      .value.trim()
    const {code, resolvedPath} = resolveModuleContents({
      filename,
      module: path.node.source.value,
    })
    let args
    if (codegenComment !== 'codegen') {
      args = transformAndRequire(
        {
          code: `module.exports = [${codegenComment
            .replace(/codegen\((.*)\)/, '$1')
            .trim()}]`,
          filename,
        },
        babel,
      )
    }
    replace(
      {
        path,
        code,
        filename: resolvedPath,
        args,
        parserOpts,
      },
      babel,
    )
  }

  function asIdentifier(path, filename, parserOpts) {
    const targetPath = path.parentPath
    switch (targetPath.type) {
      case 'TaggedTemplateExpression': {
        return asTag(targetPath, filename)
      }
      case 'CallExpression': {
        const isCallee = targetPath.get('callee') === path
        if (isCallee) {
          return asFunction(targetPath, filename, parserOpts)
        } else {
          return false
        }
      }
      case 'JSXOpeningElement': {
        const jsxElement = targetPath.parentPath
        return asJSX(jsxElement, filename, parserOpts)
      }
      case 'JSXClosingElement': {
        // ignore the closing element
        // but don't mark as unhandled (return false)
        // we already handled the opening element
        return true
      }
      case 'MemberExpression': {
        const callPath = targetPath.parentPath
        const isRequireCall = isPropertyCall(callPath, 'require')
        if (isRequireCall) {
          return asImportCall(callPath, filename, parserOpts)
        } else {
          return false
        }
      }
      default: {
        return false
      }
    }
  }

  function asImportCall(path, filename, parserOpts) {
    const [source, ...args] = path.get('arguments')
    const {code, resolvedPath} = resolveModuleContents({
      filename,
      module: source.node.value,
    })
    const argValues = args.map(a => {
      const result = a.evaluate()
      if (!result.confident) {
        throw new Error(
          'codegen cannot determine the value of an argument in codegen.require',
        )
      }
      return result.value
    })
    replace(
      {path, code, filename: resolvedPath, args: argValues, parserOpts},
      babel,
    )
  }

  function asTag(path, filename, parserOpts) {
    const code = path.get('quasi').evaluate().value
    if (!code) {
      throw path.buildCodeFrameError(
        'Unable to determine the value of your codegen string',
        Error,
      )
    }
    replace({path, code, filename, parserOpts}, babel)
  }

  function asFunction(path, filename) {
    const argumentsPaths = path.get('arguments')
    const code = argumentsPaths[0].evaluate().value
    replace(
      {
        path: argumentsPaths[0].parentPath,
        code,
        filename,
      },
      babel,
    )
  }

  function asJSX(path, filename, parserOpts) {
    const children = path.get('children')
    let code = children[0].node.expression.value
    if (children[0].node.expression.type === 'TemplateLiteral') {
      code = children[0].get('expression').evaluate().value
    }
    replace(
      {
        path: children[0].parentPath,
        code,
        filename,
        parserOpts,
      },
      babel,
    )
  }

  return {
    asTag,
    asJSX,
    asFunction,
    asProgram,
    asImportCall,
    asImportDeclaration,
    asIdentifier,
  }
}

/*
eslint
  complexity: ["error", 8]
*/
