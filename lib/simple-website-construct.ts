import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption, BucketPolicy, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface SimpleWebsiteConstructOptions {
  domainName: string;
  defaultRootObject: string;
  defaultNotFoundRootObject: string;
  certificate: acm.ICertificate;
  allowMethodsBucket?: HttpMethods[];
  allowMethodsCloudFront?: cloudfront.AllowedMethods;
  allowOrigins?: string[];
  allowHeaders?: string[];
  responseHeadersPolicy?: cloudfront.ResponseHeadersPolicy;
  cfnOutput?: boolean;
}

export class SimpleWebsiteConstruct extends Construct {
  public readonly bucket: Bucket;
  public readonly distribution: cloudfront.Distribution;
  constructor(scope: Construct, id: string, options: SimpleWebsiteConstructOptions) {
    super(scope, id);


    // Create a simple S3 static website hosting
    this.bucket = new cdk.aws_s3.Bucket(this, options.domainName, {
      bucketName: options.domainName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: options.allowMethodsBucket ?? [HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: options.allowOrigins ?? ['*'],
          allowedHeaders: options.allowHeaders ?? ['*'],
        },
      ],
    });

    const cloudFrontOAI = new cloudfront.OriginAccessIdentity(this, `${options.domainName}-OAI`, {
      comment: `OAI for ${options.domainName}`,
    });

    new BucketPolicy(this, `${options.domainName}-BucketPolicy`, {
      bucket: this.bucket,
    }).document.addStatements(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.bucket.arnForObjects('*')],
        principals: [cloudFrontOAI.grantPrincipal],
      })
    );

    this.distribution = new cloudfront.Distribution(this, `${options.domainName}-Distribution`, {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity: cloudFrontOAI,
        }),
        allowedMethods: options.allowMethodsCloudFront ?? cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: options.responseHeadersPolicy ?? cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      certificate: options.certificate,
      domainNames: [options.domainName],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultRootObject: options.defaultRootObject,
      errorResponses: [{
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: `/${options.defaultRootObject}`
      }, {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: `/${options.defaultNotFoundRootObject}`
      }],
    });

    if (options.cfnOutput) {
      new cdk.CfnOutput(this, `${options.domainName}/DistributionDomainName`, {
        value: this.distribution.distributionDomainName,
      });
    }
  }
}
