/* eslint react/no-is-mounted:0,react/sort-comp:0,react/prop-types:0 */
import type { ReactElement } from 'react';
import React, { Component } from 'react';
import classNames from 'classnames';
import pickAttrs from 'rc-util/lib/pickAttrs';
import defaultRequest from './request';
import getUid from './uid';
import attrAccept from './attr-accept';
import traverseFileTree from './traverseFileTree';
import type {
  UploadProps,
  UploadProgressEvent,
  UploadRequestError,
  RcFile,
  Action,
} from './interface';

class AjaxUploader extends Component<UploadProps> {
  state = { uid: getUid() };

  reqs: any = {};

  private fileInput: HTMLInputElement;

  private _isMounted: boolean;

  onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    this.uploadFiles(files);
    this.reset();
  };

  onClick = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const el = this.fileInput;
    if (!el) {
      return;
    }
    const { children, onClick } = this.props;
    if (children && (children as ReactElement).type === 'button') {
      const parent = el.parentNode as HTMLInputElement;
      parent.focus();
      parent.querySelector('button').blur();
    }
    el.click();
    if (onClick) {
      onClick(e);
    }
  };

  onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      this.onClick(e);
    }
  };

  onFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const { multiple } = this.props;

    e.preventDefault();

    if (e.type === 'dragover') {
      return;
    }

    if (this.props.directory) {
      traverseFileTree(
        Array.prototype.slice.call(e.dataTransfer.items),
        this.uploadFiles,
        (_file: RcFile) => attrAccept(_file, this.props.accept),
      );
    } else {
      let files = Array.prototype.slice
        .call(e.dataTransfer.files)
        .filter((file: RcFile) => attrAccept(file, this.props.accept));

      if (multiple === false) {
        files = files.slice(0, 1);
      }

      this.uploadFiles(files);
    }
  };

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
    this.abort();
  }

  uploadFiles = (files: FileList) => {
    const postFiles = [...files] as RcFile[];
    postFiles
      .map((file: RcFile & { uid?: string }) => {
        // eslint-disable-next-line no-param-reassign
        file.uid = getUid();
        return file;
      })
      .forEach(file => {
        this.upload(file, postFiles);
      });
  };

  upload(file: RcFile, fileList: RcFile[]) {
    const { props } = this;
    if (!props.beforeUpload) {
      // always async in case use react state to keep fileList
      Promise.resolve().then(() => {
        this.post(file);
      });
      return;
    }

    const before = props.beforeUpload(file, fileList);
    if (before && typeof before !== 'boolean' && before.then) {
      before
        .then(processedFile => {
          const processedFileType = Object.prototype.toString.call(processedFile);
          if (processedFileType === '[object File]' || processedFileType === '[object Blob]') {
            this.post(processedFile as RcFile);
            return;
          }
          this.post(file);
        })
        .catch(e => {
          // eslint-disable-next-line no-console
          console.log(e);
        });
    } else if (before !== false) {
      Promise.resolve().then(() => {
        this.post(file);
      });
    }
  }

  post(file: RcFile) {
    if (!this._isMounted) {
      return;
    }
    const { props } = this;
    const { onStart, onProgress } = props;

    new Promise(resolve => {
      let actionRet: Action | PromiseLike<string> = props.action;
      if (typeof actionRet === 'function') {
        actionRet = actionRet(file);
      }
      return resolve(actionRet);
    }).then((action: string) => {
      const { uid } = file;
      const request = props.customRequest || defaultRequest;

      let { data } = props;
      if (typeof data === 'function') {
        data = data(file);
      }

      Promise.all([file, data]).then(([transformedFile, mergedData]: [RcFile, object]) => {
        const requestOption = {
          action,
          filename: props.name,
          data: mergedData,
          file: transformedFile,
          headers: props.headers,
          withCredentials: props.withCredentials,
          method: props.method || 'post',
          onProgress: onProgress
            ? (e: UploadProgressEvent) => {
                onProgress(e, file);
              }
            : null,
          onSuccess: (ret: any, xhr: XMLHttpRequest) => {
            delete this.reqs[uid];
            props.onSuccess(ret, file, xhr);
          },
          onError: (err: UploadRequestError, ret: any) => {
            delete this.reqs[uid];
            props.onError(err, ret, file);
          },
        };

        onStart(file);
        this.reqs[uid] = request(requestOption);
      });
    });
  }

  reset() {
    this.setState({
      uid: getUid(),
    });
  }

  abort(file?: any) {
    const { reqs } = this;
    if (file) {
      const uid = file.uid ? file.uid : file;
      if (reqs[uid] && reqs[uid].abort) {
        reqs[uid].abort();
      }
      delete reqs[uid];
    } else {
      Object.keys(reqs).forEach(uid => {
        if (reqs[uid] && reqs[uid].abort) {
          reqs[uid].abort();
        }
        delete reqs[uid];
      });
    }
  }

  saveFileInput = (node: HTMLInputElement) => {
    this.fileInput = node;
  };

  render() {
    const {
      component: Tag,
      prefixCls,
      className,
      disabled,
      id,
      style,
      multiple,
      accept,
      children,
      directory,
      openFileDialogOnClick,
      onMouseEnter,
      onMouseLeave,
      ...otherProps
    } = this.props;
    const cls = classNames({
      [prefixCls]: true,
      [`${prefixCls}-disabled`]: disabled,
      [className]: className,
    });
    // because input don't have directory/webkitdirectory type declaration
    const dirProps: any = directory
      ? { directory: 'directory', webkitdirectory: 'webkitdirectory' }
      : {};
    const events = disabled
      ? {}
      : {
          onClick: openFileDialogOnClick ? this.onClick : () => {},
          onKeyDown: openFileDialogOnClick ? this.onKeyDown : () => {},
          onMouseEnter,
          onMouseLeave,
          onDrop: this.onFileDrop,
          onDragOver: this.onFileDrop,
          tabIndex: '0',
        };
    return (
      <Tag {...events} className={cls} role="button" style={style}>
        <input
          {...pickAttrs(otherProps, { aria: true, data: true })}
          id={id}
          type="file"
          ref={this.saveFileInput}
          onClick={e => e.stopPropagation()} // https://github.com/ant-design/ant-design/issues/19948
          key={this.state.uid}
          style={{ display: 'none' }}
          accept={accept}
          {...dirProps}
          multiple={multiple}
          onChange={this.onChange}
        />
        {children}
      </Tag>
    );
  }
}

export default AjaxUploader;
